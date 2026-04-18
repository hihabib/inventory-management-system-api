import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewProductionHouseStock, productionHouseStockTable } from "../drizzle/schema/productionHouseStock";
import { stockAllocationAuditTable } from "../drizzle/schema/stockAllocationAudit";
import { productTable } from "../drizzle/schema/product";
import { userTable } from "../drizzle/schema/user";
import { deliveryHistoryTable } from "../drizzle/schema/deliveryHistory";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { StockEditHistoryService } from "./stockEditHistory.service";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class ProductionHouseStockService {
    static async createOrUpdateBulk(items: Array<NewProductionHouseStock & { id?: string }>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const quantity = Number(item.totalQuantity);
                if (isNaN(quantity) || quantity <= 0) {
                    throw new Error("totalQuantity must be a positive number");
                }
                const baseData: NewProductionHouseStock = {
                    productId: item.productId,
                    totalQuantity: quantity,
                    note: item.note,
                    isDeleted: false,
                    createdBy: userId,
                    updatedBy: userId,
                    createdAt: getCurrentDate(),
                    updatedAt: getCurrentDate()
                };
                if (item.id) {
                    const existingRows = await tx
                        .select()
                        .from(productionHouseStockTable)
                        .where(eq(productionHouseStockTable.id, item.id));
                    if (existingRows.length === 0) {
                        throw new Error(`Production stock row with ID '${item.id}' not found`);
                    }
                    const existing = existingRows[0];
                    if (existing.productId !== item.productId) {
                        const [productRow] = await tx
                            .select({ name: productTable.name })
                            .from(productTable)
                            .where(eq(productTable.id, item.productId));
                        const productName = productRow?.name || "";
                        throw new Error(`Row ID '${item.id}' does not contain product '${productName}'`);
                    }

                    // Record edit history for field changes
                    const changes = [];
                    const newTotalQty = Number(existing.totalQuantity) + quantity;

                    if (Number(existing.totalQuantity) !== newTotalQty) {
                        changes.push({
                            field: 'totalQuantity' as const,
                            oldValue: existing.totalQuantity,
                            newValue: newTotalQty
                        });
                    }
                    if (item.note !== undefined && item.note !== existing.note) {
                        changes.push({
                            field: 'note' as const,
                            oldValue: existing.note,
                            newValue: item.note
                        });
                    }

                    if (changes.length > 0) {
                        await StockEditHistoryService.recordMultipleEditHistory({
                            tx,
                            stockId: item.id,
                            editedBy: userId,
                            changes,
                            changeReason: "Bulk update"
                        });
                    }

                    const [updated] = await tx
                        .update(productionHouseStockTable)
                        .set({
                            totalQuantity: newTotalQty,
                            note: item.note !== undefined ? item.note : existing.note,
                            updatedBy: userId,
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(productionHouseStockTable.id, item.id))
                        .returning();
                    results.push(updated);
                } else {
                    const [created] = await tx
                        .insert(productionHouseStockTable)
                        .values(baseData)
                        .returning();

                    // Record edit history for creation
                    await StockEditHistoryService.recordMultipleEditHistory({
                        tx,
                        stockId: created.id,
                        editedBy: userId,
                        changes: [
                            { field: 'totalQuantity', oldValue: 0, newValue: quantity },
                            ...(item.note ? [{ field: 'note' as const, oldValue: '', newValue: item.note }] : [])
                        ],
                        changeReason: "Initial creation"
                    });

                    results.push(created);
                }
            }
            return results;
        });
    }

    static async updateBulk(items: Array<{ id: string } & Partial<NewProductionHouseStock>>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const existingRows = await tx
                    .select()
                    .from(productionHouseStockTable)
                    .where(eq(productionHouseStockTable.id, item.id));
                if (existingRows.length === 0) {
                    throw new Error(`Production stock row with ID '${item.id}' not found`);
                }
                const existing = existingRows[0];

                // Track changes for edit history
                const changes = [];
                const newTotalQty = item.totalQuantity !== undefined ? Number(item.totalQuantity) : Number(existing.totalQuantity);

                if (item.totalQuantity !== undefined && Number(existing.totalQuantity) !== newTotalQty) {
                    changes.push({
                        field: 'totalQuantity' as const,
                        oldValue: existing.totalQuantity,
                        newValue: newTotalQty
                    });
                }
                if (item.note !== undefined && item.note !== existing.note) {
                    changes.push({
                        field: 'note' as const,
                        oldValue: existing.note,
                        newValue: item.note
                    });
                }

                if (changes.length > 0) {
                    await StockEditHistoryService.recordMultipleEditHistory({
                        tx,
                        stockId: item.id,
                        editedBy: userId,
                        changes,
                        changeReason: "Manual update"
                    });
                }

                let quantity = newTotalQty;
                if (isNaN(quantity) || quantity <= 0) {
                    throw new Error("totalQuantity must be a positive number");
                }
                const [updated] = await tx
                    .update(productionHouseStockTable)
                    .set({
                        totalQuantity: quantity,
                        note: item.note !== undefined ? item.note : existing.note,
                        updatedBy: userId,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(productionHouseStockTable.id, item.id))
                    .returning();
                results.push(updated);
            }
            return results;
        });
    }

    /**
     * Delete a single stock record (hard delete).
     * This permanently removes the record from the database.
     */
    static async deleteOne(id: string, userId: string) {
        const existingRows = await db
            .select()
            .from(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, id));

        if (existingRows.length === 0) {
            throw new Error(`Production stock row with ID '${id}' not found`);
        }

        const existing = existingRows[0];

        // Record deletion in edit history before deleting
        await StockEditHistoryService.recordMultipleEditHistory({
            stockId: id,
            editedBy: userId,
            changes: [
                { field: 'totalQuantity', oldValue: existing.totalQuantity, newValue: 0 },
                { field: 'note', oldValue: existing.note ?? '', newValue: '(DELETED)' }
            ],
            changeReason: "Hard delete"
        });

        // Hard delete - permanently remove
        const [deleted] = await db
            .delete(productionHouseStockTable)
            .where(eq(productionHouseStockTable.id, id))
            .returning();

        return deleted;
    }

    static async deleteBulk(items: Array<{ id: string; hardDelete?: boolean }>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const existingRows = await tx
                    .select()
                    .from(productionHouseStockTable)
                    .where(eq(productionHouseStockTable.id, item.id));
                if (existingRows.length === 0) {
                    throw new Error(`Production stock row with ID '${item.id}' not found`);
                }

                const existing = existingRows[0];

                // Record deletion in edit history
                await StockEditHistoryService.recordMultipleEditHistory({
                    tx,
                    stockId: item.id,
                    editedBy: userId,
                    changes: [
                        { field: 'totalQuantity', oldValue: existing.totalQuantity, newValue: 0 },
                        { field: 'note', oldValue: existing.note ?? '', newValue: '(DELETED)' }
                    ],
                    changeReason: item.hardDelete ? "Hard delete" : "Soft delete"
                });

                if (item.hardDelete) {
                    const [deleted] = await tx
                        .delete(productionHouseStockTable)
                        .where(eq(productionHouseStockTable.id, item.id))
                        .returning();
                    results.push(deleted);
                } else {
                    const [updated] = await tx
                        .update(productionHouseStockTable)
                        .set({
                            isDeleted: true,
                            updatedBy: userId,
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(productionHouseStockTable.id, item.id))
                        .returning();
                    results.push(updated);
                }
            }
            return results;
        });
    }

    static async getStock(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        const { page = 1, limit = 10 } = pagination;
        const offset = (page - 1) * limit;

        const conditions = [eq(productionHouseStockTable.isDeleted, false)];

        const whereClause = and(...conditions);

        // Count distinct products (not rows)
        const [countResult] = await db
            .select({ count: sql<number>`count(DISTINCT ${productionHouseStockTable.productId})` })
            .from(productionHouseStockTable)
            .where(whereClause);

        const totalCount = Number(countResult.count);

        // Fetch aggregated data per product
        const list = await db
            .select({
                productId: productionHouseStockTable.productId,
                productName: productTable.name,
                totalQuantity: sql<number>`COALESCE(SUM(${productionHouseStockTable.totalQuantity}), 0)`,
                committedQuantity: sql<number>`COALESCE(SUM(${productionHouseStockTable.committedQuantity}), 0)`,
            })
            .from(productionHouseStockTable)
            .leftJoin(productTable, eq(productionHouseStockTable.productId, productTable.id))
            .where(whereClause)
            .groupBy(productionHouseStockTable.productId, productTable.name)
            .orderBy(asc(productTable.name))
            .limit(limit)
            .offset(offset);

        // Calculate available quantity for each item
        const listWithAvailable = list.map(item => ({
            ...item,
            totalQuantity: Number(item.totalQuantity),
            committedQuantity: Number(item.committedQuantity),
            availableQuantity: Number(item.totalQuantity) - Number(item.committedQuantity),
        }));

        return {
            list: listWithAvailable,
            pagination: { page, limit, totalPages: Math.ceil(totalCount / limit), totalCount },
        };
    }

    static async getStockById(id: string) {
        const [row] = await db
            .select()
            .from(productionHouseStockTable)
            .where(and(eq(productionHouseStockTable.id, id), eq(productionHouseStockTable.isDeleted, false)));
        return row;
    }

    static async getStockDetails(productId: string) {
        const rows = await db
            .select()
            .from(productionHouseStockTable)
            .where(and(
                eq(productionHouseStockTable.productId, productId),
                eq(productionHouseStockTable.isDeleted, false)
            ))
            .orderBy(desc(productionHouseStockTable.createdAt));

        const [product] = await db
            .select({ id: productTable.id, name: productTable.name })
            .from(productTable)
            .where(eq(productTable.id, productId));

        const allocations = rows.length > 0
            ? await db
                .select()
                .from(stockAllocationAuditTable)
                .where(eq(stockAllocationAuditTable.stockId, rows[0].id))
                .orderBy(desc(stockAllocationAuditTable.createdAt))
                .limit(20)
            : [];

        return {
            productId,
            productName: product?.name ?? "Unknown",
            totalQuantity: rows.reduce((sum, r) => sum + Number(r.totalQuantity), 0),
            rows,
            allocations
        };
    }

    /**
     * Get edit history for a specific stock record with user details
     */
    static async getStockEditHistory(stockId: string) {
        return await StockEditHistoryService.getEditHistoryWithUser(stockId);
    }

    /**
     * Sync stock based on delivery history
     * Reconciles stock quantities with actual delivery history records
     */
    static async syncStock(options: {
        productId?: string;
        maintainsId?: string;
        fromDate?: Date;
        toDate?: Date;
        dryRun?: boolean;
    }) {
        return await db.transaction(async (tx) => {
            // Build query conditions for delivery histories
            const conditions = [];

            if (options.productId) {
                conditions.push(eq(deliveryHistoryTable.productId, options.productId));
            }
            if (options.maintainsId) {
                conditions.push(eq(deliveryHistoryTable.maintainsId, options.maintainsId));
            }
            if (options.fromDate) {
                conditions.push(gte(deliveryHistoryTable.createdAt, options.fromDate));
            }
            if (options.toDate) {
                conditions.push(lte(deliveryHistoryTable.createdAt, options.toDate));
            }

            // Fetch all relevant delivery histories
            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
            const deliveries = await tx
                .select()
                .from(deliveryHistoryTable)
                .where(whereClause)
                .orderBy(asc(deliveryHistoryTable.createdAt));

            // Calculate correct stock state for each product
            const productStates = new Map<string, {
                totalQuantity: number;
                deliveries: Array<{ id: string; status: string; sentQty: number; receivedQty: number }>;
            }>();

            // Process each delivery chronologically
            for (const delivery of deliveries) {
                const state = productStates.get(delivery.productId) || {
                    totalQuantity: 0,
                    deliveries: []
                };

                // Get unit conversions to calculate main unit quantities
                const [product] = await tx
                    .select()
                    .from(productTable)
                    .where(eq(productTable.id, delivery.productId));

                if (!product || !product.mainUnitId) {
                    console.warn(`[ProductionHouseStockService#sync] Skipping delivery ${delivery.id}: product or main unit not found`);
                    continue;
                }

                const unitConversions = await tx
                    .select()
                    .from(unitConversionTable)
                    .where(eq(unitConversionTable.productId, delivery.productId));

                const mainConv = unitConversions.find((uc: any) => uc.unitId === product.mainUnitId);
                if (!mainConv) {
                    console.warn(`[ProductionHouseStockService#sync] Skipping delivery ${delivery.id}: main unit conversion not found`);
                    continue;
                }

                // Calculate sent and received quantities in main unit
                let sentMainQty = 0;
                let receivedMainQty = 0;

                if (delivery.sentQuantity) {
                    const sentConv = unitConversions.find((uc: any) => uc.unitId === delivery.unitId);
                    if (sentConv) {
                        sentMainQty = Number((Number(delivery.sentQuantity) * (mainConv.conversionFactor / sentConv.conversionFactor)).toFixed(3));
                    }
                }

                if (delivery.receivedQuantity) {
                    const recConv = unitConversions.find((uc: any) => uc.unitId === delivery.unitId);
                    if (recConv) {
                        receivedMainQty = Number((Number(delivery.receivedQuantity) * (mainConv.conversionFactor / recConv.conversionFactor)).toFixed(3));
                    }
                }

                state.deliveries.push({
                    id: delivery.id,
                    status: delivery.status,
                    sentQty: sentMainQty,
                    receivedQty: receivedMainQty
                });

                // Calculate correct stock quantity based on delivery status
                if (delivery.status === 'Order-Shipped') {
                    // On ship: if this is the first entry (qty was 0), treat as auto-add
                    if (state.totalQuantity < sentMainQty) {
                        state.totalQuantity = sentMainQty;
                    }
                } else if (delivery.status === 'Order-Completed') {
                    // On complete: qty decreases by receivedQty
                    state.totalQuantity = Number((state.totalQuantity - receivedMainQty).toFixed(3));
                }

                // Clamp to non-negative
                state.totalQuantity = Math.max(0, state.totalQuantity);

                productStates.set(delivery.productId, state);
            }

            // Compare with current stock rows
            const discrepancies = [];
            for (const [productId, state] of productStates) {
                const currentRows = await tx
                    .select()
                    .from(productionHouseStockTable)
                    .where(and(
                        eq(productionHouseStockTable.productId, productId),
                        eq(productionHouseStockTable.isDeleted, false)
                    ));

                const currentTotalQty = currentRows.reduce((sum, row) =>
                    sum + Number(row.totalQuantity), 0);

                const qtyDifference = state.totalQuantity - currentTotalQty;

                if (Math.abs(qtyDifference) > 0.001) {
                    discrepancies.push({
                        productId,
                        productName: currentRows.length > 0 ? (await tx.select().from(productTable).where(eq(productTable.id, productId)))?.[0]?.name : 'Unknown',
                        expectedQty: state.totalQuantity,
                        actualQty: currentTotalQty,
                        qtyDifference: Number(qtyDifference.toFixed(3)),
                        currentRowsCount: currentRows.length,
                        deliveriesProcessed: state.deliveries.length
                    });
                }

                // Apply corrections if not dry run
                if (!options.dryRun && Math.abs(qtyDifference) > 0.001) {
                    if (currentRows.length === 0) {
                        // Create new stock row
                        if (state.totalQuantity > 0) {
                            const [created] = await tx
                                .insert(productionHouseStockTable)
                                .values({
                                    productId,
                                    totalQuantity: state.totalQuantity,
                                    note: "Synced from delivery history",
                                    isDeleted: false,
                                    createdBy: 'SYSTEM',
                                    updatedBy: 'SYSTEM',
                                    createdAt: getCurrentDate(),
                                    updatedAt: getCurrentDate()
                                })
                                .returning();

                            // Record sync in edit history
                            await StockEditHistoryService.recordMultipleEditHistory({
                                tx,
                                stockId: created.id,
                                editedBy: 'SYSTEM',
                                changes: [
                                    { field: 'totalQuantity', oldValue: 0, newValue: state.totalQuantity }
                                ],
                                changeReason: "Sync from delivery history"
                            });
                        }
                    } else {
                        // Update first existing row with qty correction
                        const firstRow = currentRows[0];
                        const newQty = Math.max(0, Number((Number(firstRow.totalQuantity) + qtyDifference).toFixed(3)));

                        await tx
                            .update(productionHouseStockTable)
                            .set({
                                totalQuantity: newQty,
                                note: `${firstRow.note || ''} (synced)`.trim(),
                                updatedBy: 'SYSTEM',
                                updatedAt: getCurrentDate()
                            })
                            .where(eq(productionHouseStockTable.id, firstRow.id));

                        // Record sync correction in edit history
                        await StockEditHistoryService.recordMultipleEditHistory({
                            tx,
                            stockId: firstRow.id,
                            editedBy: 'SYSTEM',
                            changes: [
                                ...(Math.abs(qtyDifference) > 0.001 ? [{ field: 'totalQuantity' as const, oldValue: firstRow.totalQuantity, newValue: newQty }] : [])
                            ],
                            changeReason: "Sync correction"
                        });
                    }
                }
            }

            return {
                productsAnalyzed: productStates.size,
                discrepanciesFound: discrepancies.length,
                correctionsApplied: options.dryRun ? 0 : discrepancies.length,
                dryRun: options.dryRun || false,
                details: discrepancies
            };
        });
    }

    /**
     * Reset production stock:
     * 1. Hard-delete all stock_allocation_audit rows
     * 2. Hard-delete all production_house_stock rows
     * 3. For products with Order-Shipped deliveries, insert new production_house_stock rows
     *    with totalQuantity = sum of sentQuantity
     * 4. Re-create ship allocations for each Order-Shipped delivery
     */
    static async resetStock(userId: string) {
        return await db.transaction(async (tx) => {
            // 1. Hard-delete all allocations
            const deletedAllocations = await tx
                .delete(stockAllocationAuditTable)
                .returning({ id: stockAllocationAuditTable.id });

            // 2. Hard-delete all production stock
            const deletedStock = await tx
                .delete(productionHouseStockTable)
                .returning({ id: productionHouseStockTable.id });

            // 3. Fetch all Order-Shipped delivery records with valid sentQuantity
            const shippedDeliveries = await tx
                .select({
                    id: deliveryHistoryTable.id,
                    productId: deliveryHistoryTable.productId,
                    sentQuantity: deliveryHistoryTable.sentQuantity,
                })
                .from(deliveryHistoryTable)
                .where(eq(deliveryHistoryTable.status, "Order-Shipped"));

            const validDeliveries = shippedDeliveries.filter(
                d => d.productId !== null && Number(d.sentQuantity) > 0
            );

            if (validDeliveries.length === 0) {
                return {
                    auditsDeleted: deletedAllocations.length,
                    stockRowsDeleted: deletedStock.length,
                    newStockRowsCreated: 0,
                    newAllocationsCreated: 0,
                };
            }

            // 4. Group by productId in-memory
            const productGroups = new Map<string, {
                deliveries: typeof validDeliveries;
                totalSentQty: number;
            }>();

            for (const d of validDeliveries) {
                const group = productGroups.get(d.productId!) || {
                    deliveries: [],
                    totalSentQty: 0,
                };
                group.deliveries.push(d);
                group.totalSentQty += Number(d.sentQuantity);
                productGroups.set(d.productId!, group);
            }

            // 5. Insert production_house_stock rows + ship allocations per product
            const now = getCurrentDate();
            let totalAllocations = 0;

            for (const [productId, group] of productGroups) {
                const [stockRow] = await tx
                    .insert(productionHouseStockTable)
                    .values({
                        productId,
                        totalQuantity: group.totalSentQty,
                        committedQuantity: group.totalSentQty,
                        note: "Reset from Order-Shipped deliveries",
                        isDeleted: false,
                        createdBy: userId,
                        updatedBy: userId,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .returning({
                        id: productionHouseStockTable.id,
                    });

                // Insert ship allocations for each individual delivery
                for (const delivery of group.deliveries) {
                    await tx.insert(stockAllocationAuditTable).values({
                        deliveryHistoryId: delivery.id,
                        stockId: stockRow.id,
                        allocatedQuantity: Number(delivery.sentQuantity),
                        allocationType: "ship",
                        wasAutoCreated: false,
                        autoAddedQuantity: 0,
                        totalQuantityBefore: 0,
                        sentQuantity: Number(delivery.sentQuantity),
                        createdAt: now,
                        updatedAt: now,
                    });
                    totalAllocations++;
                }
            }

            return {
                auditsDeleted: deletedAllocations.length,
                stockRowsDeleted: deletedStock.length,
                newStockRowsCreated: productGroups.size,
                newAllocationsCreated: totalAllocations,
            };
        });
    }

    /**
     * Get pending shipments (Order-Shipped but not yet Order-Completed) for a product
     */
    static async getPendingShipments(productId: string, maintainsId?: string) {
        const { maintainsTable } = await import("../drizzle/schema/maintains");
        const { unitTable } = await import("../drizzle/schema/unit");

        const shipments = await db
            .select({
                id: deliveryHistoryTable.id,
                status: deliveryHistoryTable.status,
                sentQuantity: deliveryHistoryTable.sentQuantity,
                receivedQuantity: deliveryHistoryTable.receivedQuantity,
                sentAt: deliveryHistoryTable.sentAt,
                orderedAt: deliveryHistoryTable.orderedAt,
                maintainsId: deliveryHistoryTable.maintainsId,
                maintainsName: maintainsTable.name,
                unitId: deliveryHistoryTable.unitId,
                unitName: unitTable.name,
                productName: productTable.name,
            })
            .from(deliveryHistoryTable)
            .innerJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
            .innerJoin(maintainsTable, eq(deliveryHistoryTable.maintainsId, maintainsTable.id))
            .innerJoin(unitTable, eq(deliveryHistoryTable.unitId, unitTable.id))
            .where(
                and(
                    eq(deliveryHistoryTable.productId, productId),
                    eq(deliveryHistoryTable.status, "Order-Shipped"),
                    maintainsId ? eq(deliveryHistoryTable.maintainsId, maintainsId) : undefined
                )
            )
            .orderBy(desc(deliveryHistoryTable.sentAt));

        // Get stock info for totalQuantity (physical stock)
        const [stock] = await db.select()
            .from(productionHouseStockTable)
            .where(
                and(
                    eq(productionHouseStockTable.productId, productId),
                    eq(productionHouseStockTable.isDeleted, false)
                )
            );

        // Calculate committedQuantity from actual shipments (more accurate than stock table)
        const committedQuantity = shipments.reduce((sum, s) => sum + Number(s.sentQuantity), 0);
        const totalQuantity = stock ? Number(stock.totalQuantity) : 0;

        return {
            summary: {
                totalQuantity: totalQuantity,
                committedQuantity: committedQuantity,
                availableQuantity: totalQuantity - committedQuantity,
            },
            shipments: shipments.map(s => ({
                ...s,
                sentQuantity: Number(s.sentQuantity),
                receivedQuantity: Number(s.receivedQuantity),
            }))
        };
    }
}
