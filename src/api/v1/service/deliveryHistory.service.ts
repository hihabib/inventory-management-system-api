import { asc, desc, eq, sql, and } from "drizzle-orm";
import { db } from "../drizzle/db";
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
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { productCategoryTable } from "../drizzle/schema/productCategory";

export class DeliveryHistoryService {
    static async createDeliveryHistory(deliveryHistoryData: NewDeliveryHistory[]) {
        return await db.transaction(async (tx) => {
            const stocksToAdd: NewStock[] = [];
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number }> = [];
            const stocksToReplace: Array<{ maintainsId: string, productId: string, unitId: string, pricePerQuantity: number, quantity: number, latestUnitPriceData?: Array<{ unitId: string; pricePerQuantity: number }> }> = [];

            // Apply decimal precision formatting to each delivery history item
            const formattedData = deliveryHistoryData.map(item => {
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
                } 



                return formatted;
            });

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
                            tx.rollback();
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
                            }
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
                    tx.rollback();
                    throw error;
                }
            }

            // If there are stocks to reduce, use StockBatchService instead of old proportional logic
            if (stocksToReduce.length > 0) {
                try {
                    console.log("stocks are reducing", stocksToReduce);

                    // Process each stock reduction using the new stock batch system
                    for (const stockReduction of stocksToReduce) {
                        // Find the specific stock record that matches the criteria
                        const [stockRecord] = await tx
                            .select()
                            .from(stockTable)
                            .where(
                                and(
                                    eq(stockTable.maintainsId, stockReduction.maintainsId),
                                    eq(stockTable.productId, stockReduction.productId),
                                    eq(stockTable.unitId, stockReduction.unitId)
                                )
                            );

                        if (!stockRecord) {
                            throw new Error(`Stock record not found for product ${stockReduction.productId} with unit ${stockReduction.unitId}`);
                        }

                        // Use StockBatchService to process the reduction properly
                        await StockBatchService.processSaleByStockId(stockRecord.id, stockReduction.unitId, stockReduction.quantity);
                    }
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#create] Rolling back during stocksToReduce", { error });
                    tx.rollback();
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
                            tx.rollback();
                            throw new Error(`Product or main unit not found for product ${productId}`);
                        }

                        const unitConversions = await tx.select().from(unitConversionTable).where(eq(unitConversionTable.productId, productId));
                        const mainConv = unitConversions.find(uc => uc.unitId === product.mainUnitId);
                        const refConv = unitConversions.find(uc => uc.unitId === reference.unitId);
                        if (!mainConv || !refConv) {
                            console.error("[DeliveryHistoryService#create] Rolling back: unit conversion not found for replace", { productId, mainUnitId: product.mainUnitId, refUnitId: reference.unitId });
                            tx.rollback();
                            throw new Error(`Unit conversion not found for product ${productId}`);
                        }

                        // Compute main unit quantity from provided unit quantity
                        const mainUnitQuantity = Number((reference.quantity * (mainConv.conversionFactor / refConv.conversionFactor)).toFixed(3));

                        // Remove all existing stocks and batches for this product-maintains
                        await tx.delete(stockTable)
                            .where(and(eq(stockTable.productId, productId), eq(stockTable.maintainsId, maintainsId)));
                        await tx.delete(stockBatchTable)
                            .where(and(eq(stockBatchTable.productId, productId), eq(stockBatchTable.maintainsId, maintainsId)));

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

                        // Update latestUnitPriceData for all Reset-Completed records in this group
                        for (const item of items) {
                            await tx.update(deliveryHistoryTable)
                                .set({ latestUnitPriceData: unitPrices })
                                .where(eq(deliveryHistoryTable.id, (createdDeliveryHistories.find(d => d.productId === item.productId && d.maintainsId === item.maintainsId && d.status === 'Reset-Completed' && d.unitId === item.unitId)?.id) ?? item.productId));
                        }
                    }
                } catch (error) {
                    console.error("[DeliveryHistoryService#create] Rolling back during stocksToReplace", { error });
                    tx.rollback();
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
                console.error("[DeliveryHistoryService#update] Rolling back: delivery history not found", { id });
                tx.rollback();
            }

            // Apply decimal precision formatting
            const formattedData = {
                ...deliveryHistoryData,
                ...(deliveryHistoryData.pricePerQuantity && { pricePerQuantity: parseFloat(deliveryHistoryData.pricePerQuantity.toFixed(2)) }),
                ...(deliveryHistoryData.sentQuantity && { sentQuantity: parseFloat(deliveryHistoryData.sentQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.receivedQuantity && { receivedQuantity: parseFloat(deliveryHistoryData.receivedQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.orderedQuantity && { orderedQuantity: parseFloat(deliveryHistoryData.orderedQuantity.toFixed(3)) }),
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
            }

            // Update the delivery history
            const [updated] = await tx.update(deliveryHistoryTable)
                .set(formattedData)
                .where(eq(deliveryHistoryTable.id, id))
                .returning();

            // If status is being updated to 'Order-Completed', add stock and set latestUnitPriceData
            if (deliveryHistoryData.status === 'Order-Completed') {
                const stockData: NewStock = {
                    maintainsId: updated.maintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    pricePerQuantity: updated.pricePerQuantity,
                    quantity: updated.receivedQuantity
                };

                try {
                    console.log("stock is adding", stockData);
                    const unitPricesFromClient = Array.isArray((deliveryHistoryData as any).latestUnitPriceData)
                        ? (deliveryHistoryData as any).latestUnitPriceData as { unitId: string; pricePerQuantity: number }[]
                        : undefined;
                    const updatePayload: {
                        mainUnitQuantity: number;
                        unitPrices?: { unitId: string; pricePerQuantity: number }[];
                        productionDate: Date;
                    } = {
                        mainUnitQuantity: stockData.quantity,
                        productionDate: getCurrentDate()
                    };
                    if (unitPricesFromClient && unitPricesFromClient.length > 0) {
                        updatePayload.unitPrices = unitPricesFromClient;
                    }
                    await StockBatchService.updateLatestBatchByProductAndMaintains(
                        stockData.productId,
                        stockData.maintainsId,
                        updatePayload
                    );

                    // Persist latest unit price data on the delivery history
                    const dataToPersist = (unitPricesFromClient && unitPricesFromClient.length > 0)
                        ? unitPricesFromClient
                        : [{ unitId: stockData.unitId, pricePerQuantity: stockData.pricePerQuantity }];
                    await tx.update(deliveryHistoryTable)
                        .set({ latestUnitPriceData: dataToPersist })
                        .where(eq(deliveryHistoryTable.id, updated.id));
                } catch (error) {
                    // If stock creation fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#update] Rolling back during Order-Completed stock add", { id, stockData, error });
                    tx.rollback();
                    throw error;
                }
            }

            // If status is being updated to 'Return-Completed', reduce stock
            if (deliveryHistoryData.status === 'Return-Completed') {
                const stockReduction = {
                    maintainsId: updated.maintainsId,
                    productId: updated.productId,
                    unitId: updated.unitId,
                    quantity: updated.receivedQuantity
                };

                try {
                    console.log("stock is reducing", stockReduction);

                    // Find the specific stock record that matches the criteria
                    const [stockRecord] = await tx
                        .select()
                        .from(stockTable)
                        .where(
                            and(
                                eq(stockTable.maintainsId, stockReduction.maintainsId),
                                eq(stockTable.productId, stockReduction.productId),
                                eq(stockTable.unitId, stockReduction.unitId)
                            )
                        );

                    if (!stockRecord) {
                        throw new Error(`Stock record not found for product ${stockReduction.productId} with unit ${stockReduction.unitId}`);
                    }

                    // Use StockBatchService to process the reduction properly
                    await StockBatchService.processSaleByStockId(stockRecord.id, stockReduction.unitId, stockReduction.quantity);
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#update] Rolling back during Return-Completed stock reduce", { id, stockReduction, error });
                    tx.rollback();
                    throw error;
                }
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
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number }> = [];
            // Aggregate client-provided unit prices per product-maintains key
            const clientUnitPricesByKey: Record<string, { unitId: string; pricePerQuantity: number }[]> = {};

            for (const item of deliveryHistoryData) {
                const { id, ...updateData } = item;

                // Check if delivery history exists
                const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
                if (existingDeliveryHistory.length === 0) {
                    console.error("[DeliveryHistoryService#bulkUpdate] Rolling back: delivery history not found", { id });
                    tx.rollback();
                }

                // Apply decimal precision formatting
                const formattedUpdateData = {
                    ...updateData,
                    ...(updateData.pricePerQuantity && { pricePerQuantity: parseFloat(updateData.pricePerQuantity.toFixed(2)) }),
                    ...(updateData.sentQuantity && { sentQuantity: parseFloat(updateData.sentQuantity.toFixed(3)) }),
                    ...(updateData.receivedQuantity && { receivedQuantity: parseFloat(updateData.receivedQuantity.toFixed(3)) }),
                    ...(updateData.orderedQuantity && { orderedQuantity: parseFloat(updateData.orderedQuantity.toFixed(3)) }),
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
                }

                // Update the delivery history
                const [updated] = await tx.update(deliveryHistoryTable)
                    .set(formattedUpdateData)
                    .where(eq(deliveryHistoryTable.id, id))
                    .returning();

                // If status is being updated to 'Order-Completed', prepare stock data to add
                if (updateData.status === 'Order-Completed') {
                    const stockData: NewStock = {
                        maintainsId: updated.maintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        pricePerQuantity: parseFloat(updated.pricePerQuantity.toFixed(2)),
                        quantity: parseFloat(updated.receivedQuantity.toFixed(3))
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
                if (updateData.status === 'Return-Completed') {
                    const stockReduction = {
                        maintainsId: updated.maintainsId,
                        productId: updated.productId,
                        unitId: updated.unitId,
                        quantity: updated.receivedQuantity
                    };
                    stocksToReduce.push(stockReduction);
                }

                results.push(updated);
            }

            // If there are stocks to add, update latest batch or create new when prices differ
            if (stocksToAdd.length > 0) {
                try {
                    console.log("stocks are adding", stocksToAdd)
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
                            console.error("[DeliveryHistoryService#bulkUpdate] Rolling back: main unit stock not found", {
                                key,
                                productId: stocks[0].productId,
                                maintainsId: stocks[0].maintainsId,
                                mainUnitId
                            });
                            tx.rollback();
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
                            }
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
                } catch (error) {
                    // If stock update fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#bulkUpdate] Rolling back during stocksToAdd", { error });
                    tx.rollback();
                    throw error;
                }
            }

            // If there are stocks to reduce, use StockBatchService instead of old proportional logic
            if (stocksToReduce.length > 0) {
                try {
                    console.log("stocks are reducing", stocksToReduce)

                    // Process each stock reduction using the new stock batch system
                    for (const stockReduction of stocksToReduce) {
                        // Find the specific stock record that matches the criteria
                        const [stockRecord] = await tx
                            .select()
                            .from(stockTable)
                            .where(
                                and(
                                    eq(stockTable.maintainsId, stockReduction.maintainsId),
                                    eq(stockTable.productId, stockReduction.productId),
                                    eq(stockTable.unitId, stockReduction.unitId)
                                )
                            );

                        if (!stockRecord) {
                            throw new Error(`Stock record not found for product ${stockReduction.productId} with unit ${stockReduction.unitId}`);
                        }

                        // Use StockBatchService to process the reduction properly
                        await StockBatchService.processSaleByStockId(stockRecord.id, stockReduction.unitId, stockReduction.quantity);
                    }
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
                    console.error("[DeliveryHistoryService#bulkUpdate] Rolling back during stocksToReduce", { error });
                    tx.rollback();
                    throw error;
                }
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
                tx.rollback();
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

        return await filterWithPaginate(deliveryHistoryTable, {
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