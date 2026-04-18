import { and, desc, eq } from "drizzle-orm";
import { productionHouseStockTable } from "../drizzle/schema/productionHouseStock";
import { stockAllocationAuditTable } from "../drizzle/schema/stockAllocationAudit";
import { stockConfigTable } from "../drizzle/schema/stockConfig";
import { productTable } from "../drizzle/schema/product";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { deliveryHistoryTable } from "../drizzle/schema/deliveryHistory";
import { unitTable } from "../drizzle/schema/unit";
import { AppError } from "../utils/AppError";
import { getCurrentDate } from "../utils/timezone";
import { StockEditHistoryService } from "./stockEditHistory.service";

/**
 * Dedicated service for stock allocation audit management.
 * Handles all stock quantity changes triggered by delivery history status transitions.
 *
 * Key invariants:
 * - One active row per product in production_house_stock table
 * - totalQuantity cannot be negative
 *
 * Renamed from: ReadyProductAllocationService
 */
export class StockAllocationAuditService {

    /**
     * Get or create the single active production_house_stock row for a product.
     * Uses FOR UPDATE to prevent concurrent modification within a transaction.
     */
    static async getOrCreateStock(tx: any, productId: string, userId: string) {
        const rows = await tx
            .select()
            .from(productionHouseStockTable)
            .where(and(
                eq(productionHouseStockTable.productId, productId),
                eq(productionHouseStockTable.isDeleted, false)
            ))
            .for("update");

        if (rows.length > 0) {
            return rows[0];
        }

        const [created] = await tx
            .insert(productionHouseStockTable)
            .values({
                productId,
                totalQuantity: 0,
                note: "Auto-created by system",
                isDeleted: false,
                createdBy: userId,
                updatedBy: userId,
                createdAt: getCurrentDate(),
                updatedAt: getCurrentDate()
            })
            .returning();

        return created;
    }

    /**
     * Read a config value from stock_config table.
     * Returns the default if key not found.
     */
    static async getConfig(tx: any, key: string, defaultValue: string = "false"): Promise<string> {
        const rows = await tx
            .select({ value: stockConfigTable.value })
            .from(stockConfigTable)
            .where(eq(stockConfigTable.key, key));

        return rows.length > 0 ? rows[0].value : defaultValue;
    }

    /**
     * Convert a quantity from one unit to mainUnit for a product.
     */
    static async convertToMainUnit(tx: any, productId: string, unitId: string, quantity: number): Promise<number> {
        const [product] = await tx
            .select({ mainUnitId: productTable.mainUnitId })
            .from(productTable)
            .where(eq(productTable.id, productId));

        if (!product || !product.mainUnitId) {
            throw new AppError(`Product or main unit not found for product ${productId}`, 400);
        }

        // If the unit IS the main unit, no conversion needed
        if (unitId === product.mainUnitId) {
            return Number(quantity.toFixed(3));
        }

        const unitConversions = await tx
            .select()
            .from(unitConversionTable)
            .where(eq(unitConversionTable.productId, productId));

        const mainConv = unitConversions.find((uc: any) => uc.unitId === product.mainUnitId);
        const sentConv = unitConversions.find((uc: any) => uc.unitId === unitId);

        if (!mainConv || !sentConv) {
            throw new AppError(`Unit conversion not found for product ${productId}`, 400);
        }

        return Number((quantity * (mainConv.conversionFactor / sentConv.conversionFactor)).toFixed(3));
    }

    /**
     * Get product name for error messages.
     */
    static async getProductName(tx: any, productId: string): Promise<string> {
        const [product] = await tx
            .select({ name: productTable.name })
            .from(productTable)
            .where(eq(productTable.id, productId));
        return product?.name || productId;
    }

    /**
     * Record an allocation entry for audit trail.
     */
    static async recordAllocation(tx: any, data: {
        deliveryHistoryId: string;
        stockId: string;
        allocatedQuantity: number;
        allocationType: string;
        wasAutoCreated?: boolean;
        autoAddedQuantity?: number;
        totalQuantityBefore: number;
        sentQuantity?: number;
    }) {
        const now = getCurrentDate();
        await tx.insert(stockAllocationAuditTable).values({
            deliveryHistoryId: data.deliveryHistoryId,
            stockId: data.stockId,
            allocatedQuantity: data.allocatedQuantity,
            allocationType: data.allocationType,
            wasAutoCreated: data.wasAutoCreated || false,
            autoAddedQuantity: data.autoAddedQuantity || 0,
            totalQuantityBefore: data.totalQuantityBefore,
            sentQuantity: data.sentQuantity || 0,
            createdAt: now,
            updatedAt: now
        });
    }

    // ─── Status Transition Handlers ─────────────────────────────────────

    /**
     * Handle Order-Shipped status.
     * - If stock insufficient: auto-add if allowed, else error
     * - Records the shipment in audit trail
     */
    static async handleOrderShipped(tx: any, deliveryHistory: any, userId: string) {
        const productId = deliveryHistory.productId;
        const sentMainQty = await this.convertToMainUnit(tx, productId, deliveryHistory.unitId, deliveryHistory.sentQuantity);

        if (sentMainQty <= 0) return;

        const stock = await this.getOrCreateStock(tx, productId, userId);
        let autoAdded = 0;
        const productName = await this.getProductName(tx, productId);

        let currentQty = Number(stock.totalQuantity);
        const committedQty = Number(stock.committedQuantity || 0);
        const availableQty = Number((currentQty - committedQty).toFixed(3));

        // Check if we have enough available stock (considering committed)
        if (availableQty < sentMainQty) {
            const shortfall = Number((sentMainQty - availableQty).toFixed(3));

            const autoAllowed = (await this.getConfig(tx, "auto_create_on_ship", "true")) === "true";
            const forceEntry = (await this.getConfig(tx, "force_manual_entry", "false")) === "true";

            if (forceEntry && !autoAllowed) {
                throw new AppError(
                    `Cannot ship ${sentMainQty} ${productName}. Available: ${availableQty}, Committed: ${committedQty}, Requested: ${sentMainQty}. Please add stock manually before shipping.`,
                    400
                );
            }

            if (!autoAllowed) {
                throw new AppError(
                    `Insufficient production stock for ${productName}. Total: ${currentQty}, Committed: ${committedQty}, Available: ${availableQty}, Requested: ${sentMainQty}. Please add stock before shipping.`,
                    400
                );
            }

            // Auto-add the shortfall
            autoAdded = shortfall;

            // Record auto_add allocation BEFORE updating
            await this.recordAllocation(tx, {
                deliveryHistoryId: deliveryHistory.id,
                stockId: stock.id,
                allocatedQuantity: shortfall,
                allocationType: "auto_add",
                wasAutoCreated: true,
                autoAddedQuantity: shortfall,
                totalQuantityBefore: currentQty,
                sentQuantity: 0
            });

            const newQty = Number((currentQty + shortfall).toFixed(3));

            await tx
                .update(productionHouseStockTable)
                .set({
                    totalQuantity: newQty,
                    updatedBy: userId,
                    updatedAt: getCurrentDate()
                })
                .where(eq(productionHouseStockTable.id, stock.id));

            // Record stock edit history for auto-add
            await StockEditHistoryService.recordEditHistory({
                tx,
                stockId: stock.id,
                editedBy: userId,
                fieldChanged: 'totalQuantity',
                oldValue: currentQty,
                newValue: newQty,
                changeReason: `Auto-add: insufficient stock for shipping ${sentMainQty} units`
            });

            // Update currentQty for the ship allocation below
            currentQty = newQty;
        }

        // Re-fetch after possible auto-add to get current values
        const [updatedStock] = await tx
            .select()
            .from(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, stock.id))
            .for("update");

        const qtyBefore = Number(updatedStock.totalQuantity);

        // Record ship allocation with snapshot
        await this.recordAllocation(tx, {
            deliveryHistoryId: deliveryHistory.id,
            stockId: stock.id,
            allocatedQuantity: sentMainQty,
            allocationType: "ship",
            wasAutoCreated: autoAdded > 0,
            autoAddedQuantity: autoAdded,
            totalQuantityBefore: qtyBefore,
            sentQuantity: sentMainQty
        });

        // Increment committedQuantity
        const newCommittedQty = Number((committedQty + sentMainQty).toFixed(3));
        await tx.update(productionHouseStockTable).set({
            committedQuantity: newCommittedQty,
            updatedBy: userId,
            updatedAt: getCurrentDate()
        }).where(eq(productionHouseStockTable.id, stock.id));
    }

    /**
     * Handle Order-Completed status.
     * - totalQuantity decreases by sentMainQty (from ship allocation)
     * - availableQuantity stays the same
     * - If auto-added and received < sent, apply correction to auto-add
     */
    static async handleOrderCompleted(tx: any, deliveryHistory: any, userId: string) {
        const productId = deliveryHistory.productId;

        // Find the ship allocation for this delivery
        const shipAllocations = await tx
            .select()
            .from(stockAllocationAuditTable)
            .where(and(
                eq(stockAllocationAuditTable.deliveryHistoryId, deliveryHistory.id),
                eq(stockAllocationAuditTable.allocationType, "ship")
            ))
            .orderBy(desc(stockAllocationAuditTable.createdAt));

        if (shipAllocations.length === 0) {
            // Delivery was created before this feature - skip
            return;
        }

        const shipAllocation = shipAllocations[0];
        const sentMainQty = Number(shipAllocation.sentQuantity);
        const autoAdded = Number(shipAllocation.autoAddedQuantity || 0);
        const stockId = shipAllocation.stockId;

        // Get the stock row with lock
        const [stock] = await tx
            .select()
            .from(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, stockId))
            .for("update");

        if (!stock) {
            throw new AppError(`Production stock row not found: ${stockId}`, 404);
        }

        let currentQty = Number(stock.totalQuantity);

        // Auto-add correction: if received < sent and there was auto-add, retroactively adjust
        let correction = 0;
        const receivedMainQty = await this.convertToMainUnit(tx, productId, deliveryHistory.unitId, deliveryHistory.receivedQuantity);

        if (autoAdded > 0 && receivedMainQty < sentMainQty) {
            correction = Math.min(autoAdded, Number((sentMainQty - receivedMainQty).toFixed(3)));
            if (correction > 0) {
                currentQty = Number((currentQty - correction).toFixed(3));
            }
        }

        const qtyBefore = currentQty;

        // qty decreases by receivedMainQty (the actual amount that left production)
        const deductionQty = Number((receivedMainQty - correction).toFixed(3));
        const newQty = Number((currentQty - deductionQty).toFixed(3));

        if (newQty < -0.001) {
            const productName = await this.getProductName(tx, productId);
            // Get unit name for better error message
            const [product] = await tx.select({ mainUnitId: productTable.mainUnitId }).from(productTable).where(eq(productTable.id, productId));
            const [unit] = product?.mainUnitId ? await tx.select({ name: unitTable.name }).from(unitTable).where(eq(unitTable.id, product.mainUnitId)) : null;

            const unitName = unit?.name || "units";
            throw new AppError(
                `Production stock has ${currentQty} ${unitName} but trying to accept ${receivedMainQty} ${unitName} for ${productName}. This would result in negative stock. Please check the delivery details or adjust the production stock quantity first.`,
                400
            );
        }

        await tx
            .update(productionHouseStockTable)
            .set({
                totalQuantity: Math.max(0, newQty),
                updatedBy: userId,
                updatedAt: getCurrentDate()
            })
            .where(eq(productionHouseStockTable.id, stockId));

        // After reducing totalQuantity, also reduce committedQuantity
        const currentCommittedQty = Number(stock.committedQuantity || 0);
        const newCommittedQty = Number((currentCommittedQty - sentMainQty).toFixed(3));

        await tx.update(productionHouseStockTable).set({
            committedQuantity: Math.max(0, newCommittedQty), // Ensure non-negative
            updatedBy: userId,
            updatedAt: getCurrentDate()
        }).where(eq(productionHouseStockTable.id, stockId));

        // Record stock edit history for totalQuantity change
        await StockEditHistoryService.recordEditHistory({
            tx,
            stockId: stockId,
            editedBy: userId,
            fieldChanged: 'totalQuantity',
            oldValue: qtyBefore,
            newValue: Math.max(0, newQty),
            changeReason: `Order completed - received ${receivedMainQty} units`
        });

        // Record complete allocation
        await this.recordAllocation(tx, {
            deliveryHistoryId: deliveryHistory.id,
            stockId: stockId,
            allocatedQuantity: deductionQty,
            allocationType: "complete",
            totalQuantityBefore: qtyBefore,
            sentQuantity: receivedMainQty
        });
    }

    /**
     * Handle Order-Cancelled (from Order-Shipped state).
     * - Reverse auto-add if any (reduce totalQuantity)
     */
    static async handleOrderCancelled(tx: any, deliveryHistory: any, userId: string) {
        // Find the ship allocation
        const shipAllocations = await tx
            .select()
            .from(stockAllocationAuditTable)
            .where(and(
                eq(stockAllocationAuditTable.deliveryHistoryId, deliveryHistory.id),
                eq(stockAllocationAuditTable.allocationType, "ship")
            ));

        if (shipAllocations.length === 0) {
            return; // No allocation to reverse
        }

        const shipAllocation = shipAllocations[0];
        const sentMainQty = Number(shipAllocation.sentQuantity);
        const autoAdded = Number(shipAllocation.autoAddedQuantity || 0);
        const stockId = shipAllocation.stockId;

        const [stock] = await tx
            .select()
            .from(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, stockId))
            .for("update");

        if (!stock) {
            return; // Row was deleted
        }

        const qtyBefore = Number(stock.totalQuantity);

        // Reverse auto-add
        let newQty = qtyBefore;
        if (autoAdded > 0) {
            newQty = Number((qtyBefore - autoAdded).toFixed(3));
        }

        // Clamp to 0
        newQty = Math.max(0, newQty);

        await tx
            .update(productionHouseStockTable)
            .set({
                totalQuantity: newQty,
                updatedBy: userId,
                updatedAt: getCurrentDate()
            })
            .where(eq(productionHouseStockTable.id, stockId));

        // Reduce committedQuantity (was added when shipped)
        const currentCommittedQty = Number(stock.committedQuantity || 0);
        const newCommittedQty = Number((currentCommittedQty - sentMainQty).toFixed(3));

        await tx.update(productionHouseStockTable).set({
            committedQuantity: Math.max(0, newCommittedQty),
            updatedBy: userId,
            updatedAt: getCurrentDate()
        }).where(eq(productionHouseStockTable.id, stockId));

        // Record stock edit history for cancellation
        if (newQty !== qtyBefore) {
            await StockEditHistoryService.recordEditHistory({
                tx,
                stockId: stockId,
                editedBy: userId,
                fieldChanged: 'totalQuantity',
                oldValue: qtyBefore,
                newValue: newQty,
                changeReason: `Order cancelled: reversed auto-add of ${autoAdded} units`
            });
        }

        // Record cancel allocation
        await this.recordAllocation(tx, {
            deliveryHistoryId: deliveryHistory.id,
            stockId: stockId,
            allocatedQuantity: -sentMainQty, // negative for audit
            allocationType: "cancel",
            autoAddedQuantity: autoAdded > 0 ? -autoAdded : 0,
            totalQuantityBefore: qtyBefore,
            sentQuantity: sentMainQty
        });
    }

    /**
     * Handle revert from Order-Shipped to Order-Placed.
     * Same logic as cancel — reverses the ship allocation.
     */
    static async handleRevertToPlaced(tx: any, deliveryHistoryId: string, userId: string) {
        // Find the ship allocation
        const shipAllocations = await tx
            .select()
            .from(stockAllocationAuditTable)
            .where(and(
                eq(stockAllocationAuditTable.deliveryHistoryId, deliveryHistoryId),
                eq(stockAllocationAuditTable.allocationType, "ship")
            ));

        if (shipAllocations.length === 0) {
            return;
        }

        const shipAllocation = shipAllocations[0];
        const sentMainQty = Number(shipAllocation.sentQuantity);
        const autoAdded = Number(shipAllocation.autoAddedQuantity || 0);
        const stockId = shipAllocation.stockId;

        const [stock] = await tx
            .select()
            .from(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, stockId))
            .for("update");

        if (!stock) {
            return;
        }

        const qtyBefore = Number(stock.totalQuantity);

        // Reverse auto-add
        let newQty = qtyBefore;
        if (autoAdded > 0) {
            newQty = Number((qtyBefore - autoAdded).toFixed(3));
        }

        newQty = Math.max(0, newQty);

        await tx
            .update(productionHouseStockTable)
            .set({
                totalQuantity: newQty,
                updatedBy: userId,
                updatedAt: getCurrentDate()
            })
            .where(eq(productionHouseStockTable.id, stockId));

        // Reduce committedQuantity (was added when shipped)
        const currentCommittedQty = Number(stock.committedQuantity || 0);
        const newCommittedQty = Number((currentCommittedQty - sentMainQty).toFixed(3));

        await tx.update(productionHouseStockTable).set({
            committedQuantity: Math.max(0, newCommittedQty),
            updatedBy: userId,
            updatedAt: getCurrentDate()
        }).where(eq(productionHouseStockTable.id, stockId));

        // Record stock edit history for revert
        if (newQty !== qtyBefore) {
            await StockEditHistoryService.recordEditHistory({
                tx,
                stockId: stockId,
                editedBy: userId,
                fieldChanged: 'totalQuantity',
                oldValue: qtyBefore,
                newValue: newQty,
                changeReason: `Order reverted to placed: reversed auto-add of ${autoAdded} units`
            });
        }

        await this.recordAllocation(tx, {
            deliveryHistoryId: deliveryHistoryId,
            stockId: stockId,
            allocatedQuantity: -sentMainQty,
            allocationType: "cancel",
            autoAddedQuantity: autoAdded > 0 ? -autoAdded : 0,
            totalQuantityBefore: qtyBefore,
            sentQuantity: sentMainQty
        });
    }

    /**
     * Handle Return-Completed status.
     * Product returns to production house: totalQuantity increases.
     */
    static async handleReturnCompleted(tx: any, deliveryHistory: any, userId: string) {
        const productId = deliveryHistory.productId;
        const returnMainQty = await this.convertToMainUnit(tx, productId, deliveryHistory.unitId, deliveryHistory.receivedQuantity);

        if (returnMainQty <= 0) return;

        const stock = await this.getOrCreateStock(tx, productId, userId);

        const qtyBefore = Number(stock.totalQuantity);

        const newQty = Number((qtyBefore + returnMainQty).toFixed(3));

        await tx
            .update(productionHouseStockTable)
            .set({
                totalQuantity: newQty,
                updatedBy: userId,
                updatedAt: getCurrentDate()
            })
            .where(eq(productionHouseStockTable.id, stock.id));

        // Record stock edit history for return
        await StockEditHistoryService.recordEditHistory({
            tx,
            stockId: stock.id,
            editedBy: userId,
            fieldChanged: 'totalQuantity',
            oldValue: qtyBefore,
            newValue: newQty,
            changeReason: `Return completed: ${returnMainQty} units returned to production`
        });

        await this.recordAllocation(tx, {
            deliveryHistoryId: deliveryHistory.id,
            stockId: stock.id,
            allocatedQuantity: returnMainQty,
            allocationType: "return",
            totalQuantityBefore: qtyBefore,
            sentQuantity: returnMainQty
        });
    }
}
