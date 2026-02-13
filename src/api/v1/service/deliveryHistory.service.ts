import { asc, desc, eq, sql, and, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { AppError } from "../utils/AppError";
import { NewDeliveryHistory, deliveryHistoryTable } from "../drizzle/schema/deliveryHistory";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { StockService } from "./stock.service";
import { StockBatchService } from "./stockBatch.service";
import { NewStock, stockTable } from "../drizzle/schema/stock";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { stockBatchTable } from "../drizzle/schema/stockBatch";
import { randomUUID } from "crypto";
import { getCurrentDate } from "../utils/timezone";
import { productTable } from "../drizzle/schema/product";
import { unitTable } from "../drizzle/schema/unit";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { maintainsTable } from "../drizzle/schema/maintains";

export class DeliveryHistoryService {
    private static async validateSenderStock(tx: any, productId: string, senderMaintainsId: string, quantity: number, unitId: string) {
        if (!quantity || quantity <= 0) return;

        // Get product and main unit
        const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));
        if (!product || !product.mainUnitId) return; // Should handle error?

        // Get unit conversions
        const unitConversions = await tx.select().from(unitConversionTable).where(eq(unitConversionTable.productId, productId));
        const mainConv = unitConversions.find((uc: any) => uc.unitId === product.mainUnitId);
        const reqConv = unitConversions.find((uc: any) => uc.unitId === unitId);

        if (!mainConv || !reqConv) return;

        const reqMainQty = quantity * (reqConv.conversionFactor / mainConv.conversionFactor);

        // Get available stock in main unit for sender
        const senderStocks = await tx.select().from(stockTable).where(and(
            eq(stockTable.productId, productId),
            eq(stockTable.maintainsId, senderMaintainsId)
        ));

        let availableMainQty = 0;
        for (const stock of senderStocks) {
            const stockConv = unitConversions.find((uc: any) => uc.unitId === stock.unitId);
            if (stockConv) {
                availableMainQty += Number(stock.quantity) * (stockConv.conversionFactor / mainConv.conversionFactor);
            }
        }

        if (availableMainQty < reqMainQty) {
            const [maintains] = await tx.select().from(maintainsTable).where(eq(maintainsTable.id, senderMaintainsId));
            throw new Error(`No enough stock for this product in ${maintains?.name || 'Sender Outlet'}`);
        }
    }

    static async createDeliveryHistory(deliveryHistoryData: NewDeliveryHistory[]) {
        return await db.transaction(async (tx) => {
            const stocksToAdd: NewStock[] = [];
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number, options?: { force?: boolean, pricePerQuantity?: number } }> = [];
            const stocksToReplace: Array<{ maintainsId: string, productId: string, unitId: string, pricePerQuantity: number, quantity: number, latestUnitPriceData?: Array<{ unitId: string; pricePerQuantity: number }> }> = [];

            // Apply decimal precision formatting to each delivery history item
            const formattedData = [];
            
            for (const item of deliveryHistoryData) {
                const formatted = {
                    ...item,
                    pricePerQuantity: Number(item.pricePerQuantity.toFixed(2)),
                    ...(item.neededAt && { neededAt: new Date(item.neededAt) }),
                    ...(item.sentQuantity && { sentQuantity: Number(item.sentQuantity.toFixed(3)) }),
                    ...(item.receivedQuantity && { receivedQuantity: Number(item.receivedQuantity.toFixed(3)) }),
                    ...(item.orderedQuantity && { orderedQuantity: Number(item.orderedQuantity.toFixed(3)) }),
                    ...(item.latestUnitPriceData && { latestUnitPriceData: item.latestUnitPriceData })
                };

                // Set current time according to status 
                if (item.status === "Order-Placed") {
                    formatted.orderedAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if (item.status === 'Order-Shipped' || item.status === "Return-Placed") {
                    formatted.sentAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if (item.status === "Order-Completed" || item.status === "Return-Completed") {
                    // Use same timestamp for both receivedAt and sentAt
                    const currentTime = getCurrentDate();
                    formatted.receivedAt = currentTime;
                    formatted.sentAt = currentTime;
                    formatted.cancelledAt = null;
                } else if (item.status === "Order-Cancelled") {
                    formatted.cancelledAt = getCurrentDate();
                } else if (item.status === "Reset-Requested" || item.status === "Reset-Completed") {
                    formatted.sentAt = getCurrentDate();
                } else if (item.status === "Transfer-Placed") {
                    formatted.sentAt = getCurrentDate(); // Use sentAt for transfer placed date
                    formatted.orderedAt = null;
                    formatted.cancelledAt = null;
                    // Ensure required fields are set to 0 if not provided
                    formatted.orderedQuantity = item.orderedQuantity ? Number(item.orderedQuantity.toFixed(3)) : 0;
                    formatted.receivedQuantity = item.receivedQuantity ? Number(item.receivedQuantity.toFixed(3)) : 0;
                } else if (item.status === "Transfer-Completed") {
                    formatted.receivedAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if (item.status === "Transfer-Cancelled") {
                    formatted.cancelledAt = getCurrentDate();
                }

                // Validate sender stock for Transfer statuses
                if (["Transfer-Placed", "Transfer-Completed", "Transfer-Cancelled"].includes(item.status)) {
                    if (!item.transferSenderMaintainsId) {
                        throw new Error(`transferSenderMaintainsId is required for status ${item.status}`);
                    }
                }

                if (item.status === "Transfer-Placed") {
                    const qty = item.sentQuantity || item.orderedQuantity || item.receivedQuantity || 0;
                    if (item.transferSenderMaintainsId && qty > 0) {
                        await DeliveryHistoryService.validateSenderStock(tx, item.productId, item.transferSenderMaintainsId, qty, item.unitId);
                    }
                }

                formattedData.push(formatted);
            }

            const createdDeliveryHistories = await tx.insert(deliveryHistoryTable).values(formattedData).returning();

            // Process stock management for each created delivery history
            for (const created of createdDeliveryHistories) {
                // If status is 'Order-Completed', prepare stock data to add
                if (created.status === 'Order-Completed') {
                    const stockData: NewStock = {
                        maintainsId: created.maintainsId,
                        productId: created.productId,
                        unitId: created.unitId,
                        pricePerQuantity: created.pricePerQuantity,
                        quantity: created.receivedQuantity
                    };
                    stocksToAdd.push(stockData);
                }

                // If status is 'Transfer-Completed', prepare stock data for transfer
                if (created.status === 'Transfer-Completed' && created.transferSenderMaintainsId) {
                    // Add to Receiver
                    stocksToAdd.push({
                        maintainsId: created.maintainsId,
                        productId: created.productId,
                        unitId: created.unitId,
                        pricePerQuantity: created.pricePerQuantity,
                        quantity: created.receivedQuantity
                    });

                    // Reduce from Sender
                    stocksToReduce.push({
                        maintainsId: created.transferSenderMaintainsId,
                        productId: created.productId,
                        unitId: created.unitId,
                        quantity: created.receivedQuantity
                    });
                }

                // If status is 'Return-Completed', prepare stock data to reduce
                if (created.status === 'Return-Completed') {
                    const stockReduction = {
                        maintainsId: created.maintainsId,
                        productId: created.productId,
                        unitId: created.unitId,
                        quantity: created.receivedQuantity
                    };
                    stocksToReduce.push(stockReduction);
                }

                // If status is 'Reset-Completed', prepare stock data to replace
                if (created.status === 'Reset-Completed') {
                    stocksToReplace.push({
                        maintainsId: created.maintainsId,
                        productId: created.productId,
                        unitId: created.unitId,
                        pricePerQuantity: created.pricePerQuantity,
                        quantity: created.sentQuantity,
                        latestUnitPriceData: created.latestUnitPriceData
                    });
                }
            }

            // If there are stocks to add, update latest batch or create new when prices differ
            if (stocksToAdd.length > 0) {
                try {
                    console.log("stocks are adding", stocksToAdd);
                    // Aggregate client-provided unit prices per product-maintains key when available
                    const clientUnitPricesByKey: Record<string, { unitId: string; pricePerQuantity: number }[]> = {};
                    for (const created of createdDeliveryHistories) {
                        if (created.status === 'Order-Completed' && Array.isArray((created as any).latestUnitPriceData) && (created as any).latestUnitPriceData.length > 0) {
                            const key = `${created.productId}-${created.maintainsId}`;
                            const incoming = (created as any).latestUnitPriceData as { unitId: string; pricePerQuantity: number }[];
                            if (!clientUnitPricesByKey[key]) clientUnitPricesByKey[key] = [];
                            // Merge and dedupe by unitId (last write wins)
                            for (const up of incoming) {
                                const idx = clientUnitPricesByKey[key].findIndex(p => p.unitId === up.unitId);
                                if (idx >= 0) clientUnitPricesByKey[key][idx] = up; else clientUnitPricesByKey[key].push(up);
                            }
                        }
                    }
                    // Group stocks by product and maintains for batch update
                    const stockGroups = stocksToAdd.reduce((groups, stock) => {
                        const key = `${stock.productId}-${stock.maintainsId}`;
                        if (!groups[key]) {
                            groups[key] = [];
                        }
                        groups[key].push(stock);
                        return groups;
                    }, {} as Record<string, NewStock[]>);

                    // Track unit prices used per group for latestUnitPriceData
                    const unitPricesByKey: Record<string, { unitId: string; pricePerQuantity: number }[]> = {};

                    // Update latest batch for each product-maintains combination
                    for (const [key, stocks] of Object.entries(stockGroups)) {
                        // Resolve product's main unit and select matching stock as main unit reference
                        const [productRow] = await tx
                            .select({ mainUnitId: productTable.mainUnitId })
                            .from(productTable)
                            .where(eq(productTable.id, stocks[0].productId));
                        const mainUnitId = productRow?.mainUnitId;
                        const mainStock = mainUnitId ? stocks.find(s => s.unitId === mainUnitId) : undefined;
                        if (!mainStock) {
                            console.error("[DeliveryHistoryService#create] Rolling back: main unit stock not found", {
                                productId: stocks[0].productId,
                                maintainsId: stocks[0].maintainsId,
                                mainUnitId
                            });
                            throw new Error(`Main unit stock not found for product ${stocks[0].productId}`);
                        }
                        // Collect unit prices: prefer client-provided latestUnitPriceData for this key
                        const clientUnitPrices = clientUnitPricesByKey[key];
                        const unitPrices = Array.isArray(clientUnitPrices) && clientUnitPrices.length > 0
                            ? clientUnitPrices
                            : stocks.map(stock => ({
                                unitId: stock.unitId,
                                pricePerQuantity: stock.pricePerQuantity
                            }));

                        unitPricesByKey[key] = unitPrices;

                        await StockBatchService.updateLatestBatchByProductAndMaintains(
                            mainStock.productId,
                            mainStock.maintainsId,
                            {
                                mainUnitQuantity: mainStock.quantity,
                                unitPrices: unitPrices,
                                productionDate: getCurrentDate()
                            },
                            tx
                        );
                    }

                    // Update latestUnitPriceData for created Order-Completed records
                    for (const created of createdDeliveryHistories) {
                        if (created.status === 'Order-Completed') {
                            const key = `${created.productId}-${created.maintainsId}`;
                            const data = unitPricesByKey[key] ?? [{ unitId: created.unitId, pricePerQuantity: created.pricePerQuantity }];
                            await tx.update(deliveryHistoryTable)
                                .set({ latestUnitPriceData: data })
                                .where(eq(deliveryHistoryTable.id, created.id));
                        }
                    }
                } catch (error) {
                    // If stock creation fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#create] Rolling back during stocksToAdd", { error });
                    throw error;
                }
            }

            // If there are stocks to reduce, use StockBatchService instead of old proportional logic
            if (stocksToReduce.length > 0) {
                try {
                    console.log("stocks are reducing", stocksToReduce);

                    // Process each stock reduction using the new stock batch system
                    for (const stockReduction of stocksToReduce) {
                        // Use StockBatchService to process the reduction properly using FIFO across batches
                        await StockBatchService.reduceProductStock(
                            stockReduction.productId, 
                            stockReduction.maintainsId, 
                            stockReduction.quantity, 
                            stockReduction.unitId,
                            undefined, // options
                            tx
                        );
                    }
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#create] Rolling back during stocksToReduce", { error });
                    throw error;
                }
            }

            // If there are stocks to replace, remove all old stock and create new batch using provided latestUnitPriceData
            if (stocksToReplace.length > 0) {
                try {
                    console.log("stocks are replacing", stocksToReplace);

                    // Group by product-maintains key
                    const replaceGroups = stocksToReplace.reduce((groups, item) => {
                        const key = `${item.productId}-${item.maintainsId}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(item);
                        return groups;
                    }, {} as Record<string, typeof stocksToReplace>);

                    for (const [key, items] of Object.entries(replaceGroups)) {
                        const { productId, maintainsId } = items[0];
                        // Use the last item for quantity/unitId reference (assumes one per group)
                        const reference = items[items.length - 1];

                        // Get product and unit conversions
                        const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));
                        if (!product || !product.mainUnitId) {
                            console.error("[DeliveryHistoryService#create] Rolling back: product or main unit not found for replace", { productId });
                            throw new Error(`Product or main unit not found for product ${productId}`);
                        }

                        const unitConversions = await tx.select().from(unitConversionTable).where(eq(unitConversionTable.productId, productId));
                        const mainConv = unitConversions.find(uc => uc.unitId === product.mainUnitId);
                        const refConv = unitConversions.find(uc => uc.unitId === reference.unitId);
                        if (!mainConv || !refConv) {
                            console.error("[DeliveryHistoryService#create] Rolling back: unit conversion not found for replace", { productId, mainUnitId: product.mainUnitId, refUnitId: reference.unitId });
                            throw new Error(`Unit conversion not found for product ${productId}`);
                        }

                        // Compute main unit quantity from provided unit quantity
                        const mainUnitQuantity = Number((reference.quantity * (mainConv.conversionFactor / refConv.conversionFactor)).toFixed(3));

                        const oldBatches = await tx
                            .select({ id: stockBatchTable.id })
                            .from(stockBatchTable)
                            .where(and(
                                eq(stockBatchTable.productId, productId),
                                eq(stockBatchTable.maintainsId, maintainsId),
                                eq(stockBatchTable.deleted, false)
                            ));
                        const oldBatchIds = oldBatches.map(b => b.id);

                        if (oldBatchIds.length > 0) {
                            await tx
                                .update(stockTable)
                                .set({ quantity: 0, updatedAt: getCurrentDate() })
                                .where(and(
                                    eq(stockTable.productId, productId),
                                    eq(stockTable.maintainsId, maintainsId),
                                    inArray(stockTable.stockBatchId, oldBatchIds)
                                ));
                        }

                        // Use client-provided latestUnitPriceData for unit prices; validate completeness
                        const unitPrices = (reference.latestUnitPriceData ?? []).slice();
                        for (const uc of unitConversions) {
                            if (!unitPrices.find(up => up.unitId === uc.unitId)) {
                                throw new Error(`Price not provided for unit ${uc.unitId} in latestUnitPriceData for product ${productId}`);
                            }
                        }

                        // Create a new batch with provided prices and computed main unit quantity
                        await StockBatchService.addNewStockBatch({
                            productId,
                            maintainsId,
                            batchNumber: randomUUID(),
                            productionDate: getCurrentDate(),
                            mainUnitQuantity,
                            unitPrices
                        }, tx);

                        if (oldBatchIds.length > 0 && Number(mainUnitQuantity) > 0) {
                            await tx
                                .update(stockBatchTable)
                                .set({ deleted: true, updatedAt: getCurrentDate() })
                                .where(inArray(stockBatchTable.id, oldBatchIds));
                        }

                        // Update latestUnitPriceData for all Reset-Completed records in this group
                        for (const item of items) {
                            const createdId = createdDeliveryHistories.find(d =>
                                d.productId === item.productId &&
                                d.maintainsId === item.maintainsId &&
                                d.status === 'Reset-Completed' &&
                                d.unitId === item.unitId
                            )?.id;
                            if (!createdId) continue;
                            await tx.update(deliveryHistoryTable)
                                .set({ latestUnitPriceData: unitPrices })
                                .where(eq(deliveryHistoryTable.id, createdId));
                        }
                    }
                } catch (error) {
                    console.error("[DeliveryHistoryService#create] Rolling back during stocksToReplace", { error });
                    throw error;
                }
            }

            return createdDeliveryHistories;
        });
    }

    static async updateDeliveryHistory(id: string, deliveryHistoryData: Partial<NewDeliveryHistory>) {
        const updatedDeliveryHistory = await db.transaction(async (tx) => {
            // Check if delivery history exists
            const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
            if (existingDeliveryHistory.length === 0) {
                throw new Error(`Delivery history with ID '${id}' not found. Please verify the delivery history ID and try again.`);
            }
            const existing = existingDeliveryHistory[0];

            // Validate status transition for Transfer
            if (deliveryHistoryData.status && deliveryHistoryData.status !== existing.status) {
                const transferStatuses = ["Transfer-Placed", "Transfer-Completed", "Transfer-Cancelled"];
                const isOldTransfer = transferStatuses.includes(existing.status as any);
                const isNewTransfer = transferStatuses.includes(deliveryHistoryData.status);
                
                if (isOldTransfer && !isNewTransfer) {
                    throw new Error(`Cannot change status from ${existing.status} to ${deliveryHistoryData.status}. Transfer records can only be updated to other Transfer statuses.`);
                }
                if (!isOldTransfer && isNewTransfer) {
                     throw new Error(`Cannot change status from ${existing.status} to ${deliveryHistoryData.status}. Non-Transfer records cannot be converted to Transfer records.`);
                }
            }

            // Apply decimal precision formatting
            const formattedData = {
                ...deliveryHistoryData,
                ...(deliveryHistoryData.pricePerQuantity !== undefined && { pricePerQuantity: parseFloat(deliveryHistoryData.pricePerQuantity.toFixed(2)) }),
                ...(deliveryHistoryData.sentQuantity !== undefined && { sentQuantity: parseFloat(deliveryHistoryData.sentQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.receivedQuantity !== undefined && { receivedQuantity: parseFloat(deliveryHistoryData.receivedQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.orderedQuantity !== undefined && { orderedQuantity: parseFloat(deliveryHistoryData.orderedQuantity.toFixed(3)) }),
                updatedAt: getCurrentDate()
            };

            // Set current time if status is being updated
            if (deliveryHistoryData.status === "Order-Placed") {
                formattedData.orderedAt = getCurrentDate();
                formattedData.cancelledAt = null;
            } else if (deliveryHistoryData.status === 'Order-Shipped' || deliveryHistoryData.status === "Return-Placed") {
                formattedData.sentAt = getCurrentDate();
                formattedData.cancelledAt = null;
            } else if (deliveryHistoryData.status === "Order-Completed" || deliveryHistoryData.status === "Return-Completed") {
                formattedData.receivedAt = getCurrentDate();
                formattedData.cancelledAt = null;
            } else if (deliveryHistoryData.status === "Order-Cancelled") {
                formattedData.cancelledAt = getCurrentDate();
            } else if (deliveryHistoryData.status === "Transfer-Placed") {
                formattedData.orderedAt = null;
                formattedData.cancelledAt = null;
            } else if (deliveryHistoryData.status === "Transfer-Completed") {
                formattedData.receivedAt = getCurrentDate();
                formattedData.cancelledAt = null;
                // Ensure receivedQuantity is set from payload if provided
                if (deliveryHistoryData.receivedQuantity !== undefined) {
                    formattedData.receivedQuantity = parseFloat(deliveryHistoryData.receivedQuantity.toFixed(3));
                } else if (existing.receivedQuantity === null || existing.receivedQuantity === 0) {
                     // If not provided and not in DB, this is invalid for completion
                     // We can't easily validate here without more context, but usually controller checks this.
                     // However, for Transfer-Completed, we need a quantity to transfer.
                }
            } else if (deliveryHistoryData.status === "Transfer-Cancelled") {
                formattedData.cancelledAt = getCurrentDate();
            }

            // Update the delivery history
            const [updated] = await tx.update(deliveryHistoryTable)
                .set(formattedData)
                .where(eq(deliveryHistoryTable.id, id))
                .returning();

            // VERIFICATION: Ensure receivedQuantity is correctly persisted if it was provided
            if (deliveryHistoryData.receivedQuantity !== undefined) {
                const expectedQty = parseFloat(deliveryHistoryData.receivedQuantity.toFixed(3));
                const actualQty = Number(updated.receivedQuantity); 
                
                if (Math.abs(actualQty - expectedQty) > 0.0001) {
                        console.error("[DeliveryHistoryService#update] Verification failed for receivedQuantity", {
                        id,
                        expected: expectedQty,
                        actual: actualQty,
                        updateDataQty: deliveryHistoryData.receivedQuantity
                    });
                    throw new Error(`Data inconsistency detected: receivedQuantity for ID ${id} was not saved correctly. Expected ${expectedQty}, got ${actualQty}`);
                }
            }

            // Collect stock operations
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number, options?: { force?: boolean, pricePerQuantity?: number } }> = [];
            const stocksToAdd: NewStock[] = [];

            // 1. Transfer-Completed: Prepare Reduce Sender Stock
            if (deliveryHistoryData.status === 'Transfer-Completed' && existing.status !== 'Transfer-Completed') {
                if (!updated.transferSenderMaintainsId) {
                     throw new Error("Transfer Sender Outlet ID is missing for Transfer-Completed status");
                }
                
                // Use updated.receivedQuantity which we just verified
                stocksToReduce.push({
                    maintainsId: updated.transferSenderMaintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    quantity: updated.receivedQuantity
                });
            }

            // 2. Return-Completed: Prepare Reduce Stock
            if (deliveryHistoryData.status === 'Return-Completed') {
                stocksToReduce.push({
                    maintainsId: updated.maintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    quantity: updated.receivedQuantity
                });
            }

            // 3. Order-Completed: Prepare Add Stock
            if (deliveryHistoryData.status === 'Order-Completed') {
                stocksToAdd.push({
                    maintainsId: updated.maintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    pricePerQuantity: updated.pricePerQuantity,
                    quantity: updated.receivedQuantity
                });
            }

            // 4. Transfer-Completed: Prepare Add Receiver Stock
            if (deliveryHistoryData.status === 'Transfer-Completed' && existing.status !== 'Transfer-Completed') {
                stocksToAdd.push({
                    maintainsId: updated.maintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    pricePerQuantity: updated.pricePerQuantity,
                    quantity: updated.receivedQuantity
                });
            }

            // EXECUTE STOCK OPERATIONS
            try {
                // A. Process Reductions
                if (stocksToReduce.length > 0) {
                    console.log("[DeliveryHistoryService#update] Processing reductions:", stocksToReduce);
                    for (const reduction of stocksToReduce) {
                         // For Return-Completed, we might need processSaleByStockId if we want to target specific batch?
                         // But existing logic for Return used processSaleByStockId which takes stockId.
                         // Wait, in my previous code:
                         // if (deliveryHistoryData.status === 'Return-Completed') { ... processSaleByStockId ... }
                         // But stocksToReduce array structure I defined here doesn't have stockId.
                         // I should handle Return-Completed separately or adjust structure.
                         
                         // Actually, for Return-Completed, we need to find the stock record first.
                         if (deliveryHistoryData.status === 'Return-Completed') {
                            // Find the specific stock record
                            const [stockRecord] = await tx
                                .select()
                                .from(stockTable)
                                .where(and(
                                    eq(stockTable.maintainsId, reduction.maintainsId),
                                    eq(stockTable.productId, reduction.productId),
                                    eq(stockTable.unitId, reduction.unitId)
                                ));

                            if (!stockRecord) {
                                throw new Error(`Stock record not found for product ${reduction.productId} with unit ${reduction.unitId}.`);
                            }
                            await StockBatchService.processSaleByStockId(stockRecord.id, reduction.unitId, reduction.quantity, tx);
                         } else {
                             // Normal reduction (Transfer)
                             await StockBatchService.reduceProductStock(
                                reduction.productId, 
                                reduction.maintainsId, 
                                reduction.quantity, 
                                reduction.unitId,
                                reduction.options,
                                tx
                            );
                         }
                    }
                }

                // B. Process Additions
                if (stocksToAdd.length > 0) {
                    console.log("[DeliveryHistoryService#update] Processing additions:", stocksToAdd);
                    for (const stockData of stocksToAdd) {
                        const unitPricesFromClient = Array.isArray((deliveryHistoryData as any).latestUnitPriceData)
                            ? (deliveryHistoryData as any).latestUnitPriceData as { unitId: string; pricePerQuantity: number }[]
                            : undefined;
                        
                        // Use existing latestUnitPriceData if available and no client data
                        let unitPrices = unitPricesFromClient;
                        if (!unitPrices && updated.latestUnitPriceData) {
                             unitPrices = updated.latestUnitPriceData as any;
                        }
                        if (!unitPrices) {
                            unitPrices = [{ unitId: stockData.unitId, pricePerQuantity: stockData.pricePerQuantity }];
                        }

                        const updatePayload: {
                            mainUnitQuantity: number;
                            unitPrices: { unitId: string; pricePerQuantity: number }[];
                            productionDate: Date;
                        } = {
                            mainUnitQuantity: stockData.quantity,
                            unitPrices: unitPrices,
                            productionDate: getCurrentDate()
                        };
                        
                        await StockBatchService.updateLatestBatchByProductAndMaintains(
                            stockData.productId,
                            stockData.maintainsId,
                            updatePayload,
                            tx
                        );

                        // Persist latest unit price data
                        if (unitPricesFromClient && unitPricesFromClient.length > 0) {
                             await tx.update(deliveryHistoryTable)
                                .set({ latestUnitPriceData: unitPricesFromClient })
                                .where(eq(deliveryHistoryTable.id, updated.id));
                        }
                    }
                }

            } catch (error) {
                console.error("[DeliveryHistoryService#update] Rolling back during stock operations", { id, error });
                if (error instanceof Error) {
                     // Propagate specific errors clearly
                     if (error.message.includes("Insufficient stock") || error.message.includes("Unit conversion not found")) {
                          throw new AppError(error.message, 400);
                     }
                     throw new Error(`Stock operation failed: ${error.message}`);
                }
                throw error;
            }

            return updated;
        });

        return updatedDeliveryHistory;
    }

    static async bulkUpdateDeliveryHistory(deliveryHistoryData: Array<{
        id: string
    } & Partial<NewDeliveryHistory & {
        "latestUnitPriceData": {
            unitId: string;
            pricePerQuantity: number;
        }[]
    }>>) {
        const updatedDeliveryHistories = await db.transaction(async (tx) => {
            const results = [];
            const stocksToAdd: NewStock[] = [];
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number, options?: { force?: boolean, pricePerQuantity?: number } }> = [];
            // Aggregate client-provided unit prices per product-maintains key
            const clientUnitPricesByKey: Record<string, { unitId: string; pricePerQuantity: number }[]> = {};

            for (const item of deliveryHistoryData) {
                const { id, ...updateData } = item;

                // Check if delivery history exists
                const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
                if (existingDeliveryHistory.length === 0) {
                    console.error("[DeliveryHistoryService#bulkUpdate] Rolling back: delivery history not found", { id });
                    throw new AppError(`Delivery history with ID '${id}' not found during bulk update. Please verify all delivery history IDs and try again.`, 404);
                }
                const existing = existingDeliveryHistory[0];

                // Validate status transition for Transfer
                if (updateData.status && updateData.status !== existing.status) {
                     const transferStatuses = ["Transfer-Placed", "Transfer-Completed", "Transfer-Cancelled"];
                     const isOldTransfer = transferStatuses.includes(existing.status as any);
                     const isNewTransfer = transferStatuses.includes(updateData.status);
                     
                     if (isOldTransfer && !isNewTransfer) {
                         throw new Error(`Cannot change status from ${existing.status} to ${updateData.status}. Transfer records can only be updated to other Transfer statuses.`);
                     }
                     if (!isOldTransfer && isNewTransfer) {
                          throw new Error(`Cannot change status from ${existing.status} to ${updateData.status}. Non-Transfer records cannot be converted to Transfer records.`);
                     }
                }

                // Apply decimal precision formatting
                const formattedUpdateData = {
                    ...updateData,
                    ...(updateData.pricePerQuantity !== undefined && { pricePerQuantity: parseFloat(updateData.pricePerQuantity.toFixed(2)) }),
                    ...(updateData.sentQuantity !== undefined && { sentQuantity: parseFloat(updateData.sentQuantity.toFixed(3)) }),
                    ...(updateData.receivedQuantity !== undefined && { receivedQuantity: parseFloat(updateData.receivedQuantity.toFixed(3)) }),
                    ...(updateData.orderedQuantity !== undefined && { orderedQuantity: parseFloat(updateData.orderedQuantity.toFixed(3)) }),
                    ...(updateData.latestUnitPriceData && { latestUnitPriceData: updateData.latestUnitPriceData }),
                    updatedAt: getCurrentDate()
                };

                // Set current time if status is being updated 
                if (updateData.status === "Order-Placed") {
                    formattedUpdateData.orderedAt = getCurrentDate();
                    formattedUpdateData.cancelledAt = null;
                } else if (updateData.status === 'Order-Shipped' || updateData.status === "Return-Placed") {
                    formattedUpdateData.sentAt = getCurrentDate();
                    formattedUpdateData.cancelledAt = null;
                } else if (updateData.status === "Order-Completed" || updateData.status === "Return-Completed") {
                    formattedUpdateData.receivedAt = getCurrentDate();
                    formattedUpdateData.cancelledAt = null;
                } else if (updateData.status === "Order-Cancelled") {
                    formattedUpdateData.cancelledAt = getCurrentDate();
                } else if (updateData.status === "Transfer-Placed") {
                    formattedUpdateData.sentAt = getCurrentDate();
                    formattedUpdateData.orderedAt = null;
                    formattedUpdateData.cancelledAt = null;
                } else if (updateData.status === "Transfer-Completed") {
                    formattedUpdateData.receivedAt = getCurrentDate();
                    formattedUpdateData.cancelledAt = null;
                    // Always ensure receivedQuantity is set correctly if provided, or fallback to updated.receivedQuantity if available (though updated is not available yet in this scope properly if we rely on it before update. Wait, we do update first.)
                    // Actually, we are building `formattedUpdateData` to USE in the update.
                    if (updateData.receivedQuantity !== undefined) {
                        formattedUpdateData.receivedQuantity = Number(Number(updateData.receivedQuantity).toFixed(3));
                    }
                } else if (updateData.status === "Transfer-Cancelled") {
                    formattedUpdateData.cancelledAt = getCurrentDate();
                }

                // Update the delivery history
                const [updated] = await tx.update(deliveryHistoryTable)
                    .set(formattedUpdateData)
                    .where(eq(deliveryHistoryTable.id, id))
                    .returning();

                // VERIFICATION: Ensure receivedQuantity is correctly persisted if it was provided
                if (updateData.receivedQuantity !== undefined) {
                    const expectedQty = parseFloat(updateData.receivedQuantity.toFixed(3));
                    const actualQty = Number(updated.receivedQuantity); // Ensure number comparison
                    
                    // Allow for tiny floating point differences if any, though toFixed(3) should align them
                    if (Math.abs(actualQty - expectedQty) > 0.0001) {
                         console.error("[DeliveryHistoryService#bulkUpdate] Verification failed for receivedQuantity", {
                            id,
                            expected: expectedQty,
                            actual: actualQty,
                            updateDataQty: updateData.receivedQuantity
                        });
                        throw new Error(`Data inconsistency detected: receivedQuantity for ID ${id} was not saved correctly. Expected ${expectedQty}, got ${actualQty}`);
                    }

                    // DOUBLE VERIFICATION: Re-fetch from DB to ensure persistence
                    const [refetched] = await tx.select({ receivedQuantity: deliveryHistoryTable.receivedQuantity })
                        .from(deliveryHistoryTable)
                        .where(eq(deliveryHistoryTable.id, id));
                     
                    if (!refetched || Math.abs(Number(refetched.receivedQuantity) - expectedQty) > 0.0001) {
                         console.error("[DeliveryHistoryService#bulkUpdate] Re-fetch verification failed", { id, refetched });
                         throw new Error(`DB Persistence failure: receivedQuantity for ID ${id} was not persisted.`);
                    }
                }

                // If status is being updated to 'Order-Completed', prepare stock data to add
                // Only add stock if the status is CHANGING to 'Order-Completed'
                if (updateData.status === 'Order-Completed' && existingDeliveryHistory[0].status !== 'Order-Completed') {
                    // VALIDATION: Ensure receivedQuantity is present and valid
                    const receivedQty = updated.receivedQuantity; // This comes from DB returning()
                    
                    if (receivedQty === null || receivedQty === undefined || Number(receivedQty) <= 0) {
                         // Fallback check: if updateData didn't have it, maybe it was already in DB?
                         // But if it's 0, we shouldn't complete the order typically? 
                         // For now, warn or error if it's missing/zero but required for stock
                         console.warn("[DeliveryHistoryService#bulkUpdate] Warning: Completing order with 0 or missing receivedQuantity", { id, receivedQty });
                    }

                    const stockData: NewStock = {
                        maintainsId: updated.maintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        pricePerQuantity: parseFloat(updated.pricePerQuantity.toFixed(2)),
                        quantity: parseFloat(Number(receivedQty).toFixed(3))
                    };
                    stocksToAdd.push(stockData);
                    // Capture client-provided latestUnitPriceData for this record
                    if (Array.isArray((updateData as any).latestUnitPriceData) && (updateData as any).latestUnitPriceData.length > 0) {
                        const key = `${updated.productId}-${updated.maintainsId}`;
                        const incoming = (updateData as any).latestUnitPriceData as { unitId: string; pricePerQuantity: number }[];
                        if (!clientUnitPricesByKey[key]) clientUnitPricesByKey[key] = [];
                        for (const up of incoming) {
                            const idx = clientUnitPricesByKey[key].findIndex(p => p.unitId === up.unitId);
                            if (idx >= 0) clientUnitPricesByKey[key][idx] = up; else clientUnitPricesByKey[key].push(up);
                        }
                    }
                }

                // If status is being updated to 'Return-Completed', prepare stock data to reduce
                // Only reduce stock if the status is CHANGING to 'Return-Completed'
                if (updateData.status === 'Return-Completed' && existingDeliveryHistory[0].status !== 'Return-Completed') {
                    const stockReduction = {
                        maintainsId: updated.maintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        quantity: updated.receivedQuantity
                    };
                    stocksToReduce.push(stockReduction);
                }

                // If status is being updated to 'Transfer-Completed', prepare stock data
                if (updateData.status === 'Transfer-Completed' && existing.status !== 'Transfer-Completed') {
                     if (!updated.transferSenderMaintainsId) {
                          throw new Error(`Transfer Sender Outlet ID is missing for Transfer-Completed status for ID ${id}`);
                     }

                     // Reduce Sender Stock
                    // Use receivedQuantity because that is what was actually transferred and accepted
                    stocksToReduce.push({
                        maintainsId: updated.transferSenderMaintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        quantity: updated.receivedQuantity
                    });

                     // Add Receiver Stock
                     const stockData: NewStock = {
                        maintainsId: updated.maintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        pricePerQuantity: parseFloat(updated.pricePerQuantity.toFixed(2)),
                        quantity: parseFloat(Number(updated.receivedQuantity).toFixed(3))
                    };
                    stocksToAdd.push(stockData);

                    // Capture client-provided latestUnitPriceData or fallback to existing
                    if (Array.isArray((updateData as any).latestUnitPriceData) && (updateData as any).latestUnitPriceData.length > 0) {
                        const key = `${updated.productId}-${updated.maintainsId}`;
                        const incoming = (updateData as any).latestUnitPriceData as { unitId: string; pricePerQuantity: number }[];
                        if (!clientUnitPricesByKey[key]) clientUnitPricesByKey[key] = [];
                        for (const up of incoming) {
                            const idx = clientUnitPricesByKey[key].findIndex(p => p.unitId === up.unitId);
                            if (idx >= 0) clientUnitPricesByKey[key][idx] = up; else clientUnitPricesByKey[key].push(up);
                        }
                    } else if (updated.latestUnitPriceData) {
                         const key = `${updated.productId}-${updated.maintainsId}`;
                         const incoming = updated.latestUnitPriceData as { unitId: string; pricePerQuantity: number }[];
                         if (!clientUnitPricesByKey[key]) clientUnitPricesByKey[key] = [];
                         for (const up of incoming) {
                             const idx = clientUnitPricesByKey[key].findIndex(p => p.unitId === up.unitId);
                             if (idx < 0) clientUnitPricesByKey[key].push(up);
                         }
                    }
                }

                results.push(updated);
            }

            // Perform stock operations within the same transaction scope
            try {
                // 1. Process Stock Reductions (Sender/Return) FIRST
                if (stocksToReduce.length > 0) {
                    console.log("stocks are reducing", stocksToReduce);

                    // Process each stock reduction using the new stock batch system
                    for (const stockReduction of stocksToReduce) {
                        // Use StockBatchService to process the reduction properly using FIFO across batches
                        await StockBatchService.reduceProductStock(
                            stockReduction.productId, 
                            stockReduction.maintainsId, 
                            stockReduction.quantity, 
                            stockReduction.unitId,
                            stockReduction.options,
                            tx // Pass transaction to ensure atomic rollback
                        );
                    }
                }

                // 2. Process Stock Additions (Receiver/Order Completion) SECOND
                if (stocksToAdd.length > 0) {
                    console.log("stocks are adding", stocksToAdd);
                    // Group stocks by product and maintains for batch update
                    const stockGroups = stocksToAdd.reduce((groups, stock) => {
                        const key = `${stock.productId}-${stock.maintainsId}`;
                        if (!groups[key]) {
                            groups[key] = [];
                        }
                        groups[key].push(stock);
                        return groups;
                    }, {} as Record<string, NewStock[]>);

                    // Track unit prices used per group for latestUnitPriceData
                    const unitPricesByKey: Record<string, { unitId: string; pricePerQuantity: number }[]> = {};

                    // Update latest batch for each product-maintains combination
                    for (const [key, stocks] of Object.entries(stockGroups)) {
                        const productId = stocks[0].productId;
                        const maintainsId = stocks[0].maintainsId;

                        // Resolve product's main unit and select matching stock as main unit reference
                        const [productRow] = await tx
                            .select({ mainUnitId: productTable.mainUnitId })
                            .from(productTable)
                            .where(eq(productTable.id, productId));
                        const mainUnitId = productRow?.mainUnitId;

                        if (!mainUnitId) {
                            console.error("[DeliveryHistoryService#bulkUpdate] Rolling back: main unit not found", {
                                key,
                                productId,
                                maintainsId
                            });
                            throw new Error(`Main unit not found for product ${productId}. Cannot complete bulk order processing.`);
                        }

                        // Get unit conversions to calculate total quantity in main unit
                        const unitConversions = await tx.select()
                            .from(unitConversionTable)
                            .where(eq(unitConversionTable.productId, productId));
                        
                        const mainUnitConversion = unitConversions.find(uc => uc.unitId === mainUnitId);
                        if (!mainUnitConversion) {
                            throw new Error(`Main unit conversion not found for product ${productId}`);
                        }

                        let totalMainUnitQuantity = 0;
                        for (const stock of stocks) {
                            const conversion = unitConversions.find(uc => uc.unitId === stock.unitId);
                            if (!conversion) {
                                throw new Error(`Unit conversion not found for unit ${stock.unitId}`);
                            }
                            // Calculate quantity in main unit
                            const quantityInMain = stock.quantity * (conversion.conversionFactor / mainUnitConversion.conversionFactor);
                            totalMainUnitQuantity += quantityInMain;
                        }

                        // Round to 3 decimals to avoid floating point errors
                        totalMainUnitQuantity = Number(totalMainUnitQuantity.toFixed(3));

                        // Collect unit prices: prefer client-provided latestUnitPriceData for this key
                        const clientUnitPrices = clientUnitPricesByKey[key];
                        const unitPrices = Array.isArray(clientUnitPrices) && clientUnitPrices.length > 0
                            ? clientUnitPrices
                            : stocks.map(stock => ({
                                unitId: stock.unitId,
                                pricePerQuantity: stock.pricePerQuantity
                            }));

                        unitPricesByKey[key] = unitPrices;
                        await StockBatchService.updateLatestBatchByProductAndMaintains(
                            productId,
                            maintainsId,
                            {
                                mainUnitQuantity: totalMainUnitQuantity,
                                unitPrices: unitPrices,
                                productionDate: getCurrentDate()
                            },
                            tx // Pass transaction to ensure atomic rollback
                        );
                    }

                    // Update latestUnitPriceData for updated Order-Completed records
                    for (const updated of results) {
                        if (updated.status === 'Order-Completed') {
                            const key = `${updated.productId}-${updated.maintainsId}`;
                            const data = unitPricesByKey[key] ?? [{ unitId: updated.unitId, pricePerQuantity: updated.pricePerQuantity }];
                            await tx.update(deliveryHistoryTable)
                                .set({ latestUnitPriceData: data })
                                .where(eq(deliveryHistoryTable.id, updated.id));
                        }
                    }
                }
            } catch (error) {
                // If ANY stock operation fails, rollback the entire transaction
                console.error("[DeliveryHistoryService#bulkUpdate] Rolling back during stock operations", { error });
                // Ensure the error message is propagated clearly
                if (error instanceof Error) {
                     // Check if it's a specific stock error and propagate it directly
                     if (error.message.includes("Insufficient stock") || error.message.includes("Unit conversion not found")) {
                          throw new AppError(error.message, 400);
                     }
                     throw new Error(`Bulk stock operation failed: ${error.message}`);
                }
                throw error; 
            }

            return results;
        });

        return updatedDeliveryHistories;
    }

    static async deleteDeliveryHistory(id: string) {
        return await db.transaction(async (tx) => {
            // Check if delivery history exists
            const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
            if (existingDeliveryHistory.length === 0) {
                console.error("[DeliveryHistoryService#delete] Rolling back: delivery history not found", { id });
                throw new AppError(`Delivery history with ID '${id}' not found.`, 404);
            }

            // Delete the delivery history
            const [deleted] = await tx.delete(deliveryHistoryTable)
                .where(eq(deliveryHistoryTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getDeliveryHistories(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {

        console.log("filter", filter);
        
        // Expand productCategory.id filter to include child categories
        let modifiedFilter = { ...filter };
        if (filter && (filter as any)['productCategory.id']) {
            const categoryIds = Array.isArray((filter as any)['productCategory.id'])
                ? (filter as any)['productCategory.id']
                : [(filter as any)['productCategory.id']];

            const allCategoryIds = new Set<string>(categoryIds as string[]);
            for (const categoryId of categoryIds as string[]) {
                const childCategories = await DeliveryHistoryService.getAllChildCategories(categoryId);
                childCategories.forEach(id => allCategoryIds.add(id));
            }

            (modifiedFilter as any)['productCategory.id'] = Array.from(allCategoryIds);
        }
        // filter with createdAt current date if no date filter is selected
        // if (!filter?.['orderedAt[from]']
        //     && !filter?.['sentAt[from]']
        //     && !filter?.['receivedAt[from]']
        //     && !filter?.['cancelledAt[from]']
        //     && !filter?.['neededAt[from]']) {
        //     const date = new Date();
        //     const fromDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        //     const toDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
        //     filter['createdAt[from]'] = [fromDate.toISOString()];
        //     filter['createdAt[to]'] = [toDate.toISOString()];
        // }

        const result = await filterWithPaginate(deliveryHistoryTable, {
            pagination,
            filter: modifiedFilter,
            joins: [
                {
                    table: productTable,
                    type: "right",
                    alias: "product",
                    condition: eq(deliveryHistoryTable.productId, productTable.id)
                },
                {
                    table: productCategoryInProductTable,
                    alias: "productCategoryInProduct",
                    condition: eq(productCategoryInProductTable.productId, productTable.id)
                },
                {
                    table: productCategoryTable,
                    alias: "productCategory",
                    condition: eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id)
                }
            ],
            select: { ...deliveryHistoryTable },
            orderBy: asc(sql`
                CASE 
                    WHEN ${productTable.sku} ~ '^[0-9]+\.?[0-9]*$' 
                    THEN CAST(${productTable.sku} AS NUMERIC)
                    ELSE 999999
                END,
                ${productTable.sku}
            `)
        });

        // Summary: sentQuantity as "[sum] [unit name]"
        const sentWhere = await DeliveryHistoryService.buildWhereConditions(modifiedFilter);
        let sentQuery: any = db
            .select({
                unitName: sql<string>`COALESCE(${unitTable.name}, '')`,
                total: sql<number>`COALESCE(SUM(${deliveryHistoryTable.sentQuantity}), 0)`
            })
            .from(deliveryHistoryTable)
            .leftJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
            .leftJoin(productCategoryInProductTable, eq(productCategoryInProductTable.productId, productTable.id))
            .leftJoin(productCategoryTable, eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id))
            .leftJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
            .groupBy(sql`COALESCE(${unitTable.name}, '')`);
        if (sentWhere.length > 0) {
            sentQuery = (sentQuery as any).where(and(...sentWhere));
        }
        const sentGroups = await (sentQuery as any);
        const sentQuantity = (sentGroups || [])
            .filter((g: any) => Number(g.total) > 0)
            .map((g: any) => `${Number(g.total)} ${(g.unitName ?? '').toString()}`.trim())
            .join(' + ');

        // Summary: receivedQuantity as "[sum] [unit name]"
        const receivedWhere = await DeliveryHistoryService.buildWhereConditions(modifiedFilter);
        let receivedQuery: any = db
            .select({
                unitName: sql<string>`COALESCE(${unitTable.name}, '')`,
                total: sql<number>`COALESCE(SUM(${deliveryHistoryTable.receivedQuantity}), 0)`
            })
            .from(deliveryHistoryTable)
            .leftJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
            .leftJoin(productCategoryInProductTable, eq(productCategoryInProductTable.productId, productTable.id))
            .leftJoin(productCategoryTable, eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id))
            .leftJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
            .groupBy(sql`COALESCE(${unitTable.name}, '')`);
        if (receivedWhere.length > 0) {
            receivedQuery = (receivedQuery as any).where(and(...receivedWhere));
        }
        const receivedGroups = await (receivedQuery as any);
        const receivedQuantity = (receivedGroups || [])
            .filter((g: any) => Number(g.total) > 0)
            .map((g: any) => `${Number(g.total)} ${(g.unitName ?? '').toString()}`.trim())
            .join(' + ');

        // Summary: orderedQuantity grouped by orderedUnit (fallback to product main unit name)
        const orderedWhere = await DeliveryHistoryService.buildWhereConditions(modifiedFilter);
        let orderedQuery: any = db
            .select({
                label: sql<string>`COALESCE(NULLIF(${deliveryHistoryTable.orderedUnit}, ''), ${unitTable.name})`,
                total: sql<number>`COALESCE(SUM(${deliveryHistoryTable.orderedQuantity}), 0)`
            })
            .from(deliveryHistoryTable)
            .leftJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
            .leftJoin(productCategoryInProductTable, eq(productCategoryInProductTable.productId, productTable.id))
            .leftJoin(productCategoryTable, eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id))
            .leftJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
            .groupBy(sql`COALESCE(NULLIF(${deliveryHistoryTable.orderedUnit}, ''), ${unitTable.name})`);
        if (orderedWhere.length > 0) {
            orderedQuery = (orderedQuery as any).where(and(...orderedWhere));
        }
        const orderedGroups = await (orderedQuery as any);

        const orderedQuantity = (orderedGroups || [])
            .filter(g => Number(g.total) > 0)
            .map(g => `${Number(g.total)} ${(g.label ?? '').toString()}`)
            .join(' + ');

        return {
            ...result,
            summary: {
                sentQuantity,
                receivedQuantity,
                orderedQuantity
            }
        };
    }

    // Build WHERE conditions using the same FilterOptions semantics as filterWithPaginate
    // Supports direct columns and relationship filters (e.g., 'productCategory.id'), and date ranges '[from]/[to]'.
    static async buildWhereConditions(filter: FilterOptions): Promise<any[]> {
        const whereConditions: any[] = [];
        const tableRefs: Record<string, any> = {
            main: deliveryHistoryTable,
            product: productTable,
            productCategoryInProduct: productCategoryInProductTable,
            productCategory: productCategoryTable
        };

        for (const [column, values] of Object.entries(filter || {})) {
            if (!Array.isArray(values) || values.length === 0) continue;

            if (column.includes('[') && column.includes(']')) {
                const match = column.match(/^(.+)\[(from|to)\]$/);
                if (match) {
                    const [, fieldName, rangeType] = match;
                    const dateValue = values[0];
                    const targetTable = fieldName.includes('.') ? tableRefs[fieldName.split('.')[0]] : deliveryHistoryTable;
                    const columnName = fieldName.includes('.') ? fieldName.split('.')[1] : fieldName;
                    const tableColumn = targetTable[columnName as keyof typeof targetTable];
                    if (!tableColumn) continue;
                    if (rangeType === 'from') whereConditions.push(sql`${tableColumn} >= ${new Date(dateValue)}`);
                    else if (rangeType === 'to') whereConditions.push(sql`${tableColumn} <= ${new Date(dateValue)}`);
                    continue;
                }
            }

            if (column.includes('.')) {
                const [aliasName, columnName] = column.split('.');
                const tableRef = tableRefs[aliasName];
                if (!tableRef) continue;
                const tableColumn = tableRef[columnName as keyof typeof tableRef];
                if (!tableColumn) continue;
                if (values.length === 1) whereConditions.push(eq(tableColumn as any, values[0] as any));
                else whereConditions.push(inArray(tableColumn as any, values as any[]));
            } else {
                const tableColumn = (deliveryHistoryTable as any)[column];
                if (!tableColumn) continue;
                if (values.length === 1) whereConditions.push(eq(tableColumn, values[0]));
                else whereConditions.push(inArray(tableColumn, values as any[]));
            }
        }

        return whereConditions;
    }

    static async getDeliveryHistoryById(id: string) {
        const [deliveryHistory] = await db.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
        return deliveryHistory;
    }

    /**
     * Recursively get all child category IDs for a given parent category ID
     * Mirrors ProductService.getAllChildCategories
     */
    private static async getAllChildCategories(parentCategoryId: string): Promise<string[]> {
        const childCategories = await db
            .select({ id: productCategoryTable.id })
            .from(productCategoryTable)
            .where(eq(productCategoryTable.parentId, parentCategoryId));

        const childIds: string[] = [];
        for (const child of childCategories) {
            childIds.push(child.id);
            const grandChildren = await this.getAllChildCategories(child.id);
            childIds.push(...grandChildren);
        }
        return childIds;
    }
}
