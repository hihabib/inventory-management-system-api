import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewDeliveryHistory, deliveryHistoryTable } from "../drizzle/schema/deliveryHistory";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { StockService } from "./stock.service";
import { NewStock } from "../drizzle/schema/stock";
import { getCurrentDate } from "../utils/timezone";
import { productTable } from "../drizzle/schema/product";

export class DeliveryHistoryService {
    static async createDeliveryHistory(deliveryHistoryData: NewDeliveryHistory[]) {
        // Apply decimal precision formatting to each delivery history item
        const formattedData = deliveryHistoryData.map(item => {
            const formatted = {
                ...item,
                pricePerQuantity: Number(item.pricePerQuantity.toFixed(2)),
                ...(item.neededAt && { neededAt: new Date(item.neededAt) }),
                ...(item.sentQuantity && { sentQuantity: Number(item.sentQuantity.toFixed(3)) }),
                ...(item.receivedQuantity && { receivedQuantity: Number(item.receivedQuantity.toFixed(3)) }),
                ...(item.orderedQuantity && { orderedQuantity: Number(item.orderedQuantity.toFixed(3)) })
            };

            // Set  current time according to status 
             if (item.status === "Order-Placed") {
                    formatted.orderedAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if (item.status === 'Order-Shipped' || item.status === "Return-Placed") {
                    formatted.sentAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if (item.status === "Order-Completed" || item.status === "Return-Completed") {
                    formatted.receivedAt = getCurrentDate();
                    formatted.cancelledAt = null;
                } else if(item.status === "Order-Cancelled") {
                    formatted.cancelledAt = getCurrentDate();
                }

            return formatted;
        });

        const createdDeliveryHistories = await db.insert(deliveryHistoryTable).values(formattedData).returning();
        return createdDeliveryHistories;
    }

    static async updateDeliveryHistory(id: string, deliveryHistoryData: Partial<NewDeliveryHistory>) {
        const updatedDeliveryHistory = await db.transaction(async (tx) => {
            // Check if delivery history exists
            const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
            if (existingDeliveryHistory.length === 0) {
                tx.rollback();
            }

            // Apply decimal precision formatting
            const formattedData = {
                ...deliveryHistoryData,
                ...(deliveryHistoryData.pricePerQuantity && { pricePerQuantity: Number(deliveryHistoryData.pricePerQuantity.toFixed(2)) }),
                ...(deliveryHistoryData.sentQuantity && { sentQuantity: Number(deliveryHistoryData.sentQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.receivedQuantity && { receivedQuantity: Number(deliveryHistoryData.receivedQuantity.toFixed(3)) }),
                ...(deliveryHistoryData.orderedQuantity && { orderedQuantity: Number(deliveryHistoryData.orderedQuantity.toFixed(3)) }),
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
                } else if(deliveryHistoryData.status === "Order-Cancelled") {
                    formattedData.cancelledAt = getCurrentDate();
                }

            // Update the delivery history
            const [updated] = await tx.update(deliveryHistoryTable)
                .set(formattedData)
                .where(eq(deliveryHistoryTable.id, id))
                .returning();

            // If status is being updated to 'Order-Completed', add stock
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
                    await StockService.bulkCreateOrAddStockWithTx([stockData], tx);
                } catch (error) {
                    // If stock creation fails, rollback the entire transaction
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
                    await StockService.bulkReduceStockWithTx([stockReduction], tx);
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
                    tx.rollback();
                    throw error;
                }
            }

            return updated;
        });

        return updatedDeliveryHistory;
    }

    static async bulkUpdateDeliveryHistory(deliveryHistoryData: Array<{ id: string } & Partial<NewDeliveryHistory>>) {
        const updatedDeliveryHistories = await db.transaction(async (tx) => {
            const results = [];
            const stocksToAdd: NewStock[] = [];
            const stocksToReduce: Array<{ maintainsId: string, productId: string, unitId: string, quantity: number }> = [];

            for (const item of deliveryHistoryData) {
                const { id, ...updateData } = item;

                // Check if delivery history exists
                const existingDeliveryHistory = await tx.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
                if (existingDeliveryHistory.length === 0) {
                    tx.rollback();
                }

                // Apply decimal precision formatting
                const formattedUpdateData = {
                    ...updateData,
                    ...(updateData.pricePerQuantity && { pricePerQuantity: Number(updateData.pricePerQuantity.toFixed(2)) }),
                    ...(updateData.sentQuantity && { sentQuantity: Number(updateData.sentQuantity.toFixed(3)) }),
                    ...(updateData.receivedQuantity && { receivedQuantity: Number(updateData.receivedQuantity.toFixed(3)) }),
                    ...(updateData.orderedQuantity && { orderedQuantity: Number(updateData.orderedQuantity.toFixed(3)) }),
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
                } else if(updateData.status === "Order-Cancelled") {
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
                        pricePerQuantity: updated.pricePerQuantity,
                        quantity: updated.receivedQuantity
                    };
                    stocksToAdd.push(stockData);
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

            // If there are stocks to add, call bulkCreateOrAddStockWithTx
            if (stocksToAdd.length > 0) {
                try {
                    console.log("stocks are adding", stocksToAdd)
                    await StockService.bulkCreateOrAddStockWithTx(stocksToAdd, tx);
                } catch (error) {
                    // If stock creation fails, rollback the entire transaction
                    tx.rollback();
                    throw error;
                }
            }

            // If there are stocks to reduce, call bulkReduceStockWithTx
            if (stocksToReduce.length > 0) {
                try {
                    console.log("stocks are reducing", stocksToReduce)
                    await StockService.bulkReduceStockWithTx(stocksToReduce, tx);
                } catch (error) {
                    // If stock reduction fails, rollback the entire transaction
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
        return await filterWithPaginate(deliveryHistoryTable, {
            pagination,
            filter,
            joins: [
                {
                    table: productTable,
                    type: "right",
                    alias: "product",
                    condition: eq(deliveryHistoryTable.productId, productTable.id)
                }
            ],
            select: {...deliveryHistoryTable},
            orderBy: desc(productTable.sku)
        });
    }

    static async getDeliveryHistoryById(id: string) {
        const [deliveryHistory] = await db.select().from(deliveryHistoryTable).where(eq(deliveryHistoryTable.id, id));
        return deliveryHistory;
    }
}