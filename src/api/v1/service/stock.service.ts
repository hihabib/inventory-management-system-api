import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { maintainsTable } from "../drizzle/schema/maintains";
import { productTable } from "../drizzle/schema/product";
import { NewStock, stockTable } from "../drizzle/schema/stock";
import { unitTable } from "../drizzle/schema/unit";
import { unitInProductTable } from "../drizzle/schema/unitInProduct";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";


export class StockService {
    static async createStock(stock: NewStock) {
        const insertedStock = await db.transaction(async (tx) => {
            const existingStock = await tx.select().from(stockTable).where(and(
                eq(stockTable.maintainsId, stock.maintainsId),
                eq(stockTable.productId, stock.productId),
                eq(stockTable.unitId, stock.unitId),
            ));
            if (existingStock.length > 0) {
                tx.rollback();
            }
            const existingProductUnit = await tx.select().from(unitInProductTable).where(and(
                eq(unitInProductTable.productId, stock.productId),
                eq(unitInProductTable.unitId, stock.unitId),
            ));
            if (existingProductUnit.length === 0) {
                tx.rollback();
            }
            
            // Apply decimal precision formatting
            const formattedStock = {
                ...stock,
                pricePerQuantity: Number(stock.pricePerQuantity.toFixed(2)),
                quantity: Number(stock.quantity.toFixed(3))
            };
            
            const [insertedStock] = await tx.insert(stockTable).values(formattedStock).returning();
            return {
                ...insertedStock
            }
        })
        return insertedStock;
    }
    
    static async bulkCreateOrUpdateStock(stocks: NewStock[]) {
        return await db.transaction(async (tx) => {
            const results = [];
            
            for (const stock of stocks) {
                // Check if stock exists with the same maintainsId, productId, unitId, and pricePerQuantity
                const existingStock = await tx.select().from(stockTable).where(and(
                    eq(stockTable.maintainsId, stock.maintainsId),
                    eq(stockTable.productId, stock.productId),
                    eq(stockTable.unitId, stock.unitId),
                    eq(stockTable.pricePerQuantity, stock.pricePerQuantity),
                ));
                
                // If stock exists, update it
                if (existingStock.length > 0) {
                    const [updated] = await tx.update(stockTable)
                        .set({
                            pricePerQuantity: Number(stock.pricePerQuantity.toFixed(2)),
                            quantity: Number(stock.quantity.toFixed(3)),
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(stockTable.id, existingStock[0].id))
                        .returning();
                    
                    results.push({
                        ...updated,
                        action: 'updated'
                    });
                } 
                // If stock doesn't exist, create it
                else {
                    // Verify the product-unit combination exists
                    const existingProductUnit = await tx.select().from(unitInProductTable).where(and(
                        eq(unitInProductTable.productId, stock.productId),
                        eq(unitInProductTable.unitId, stock.unitId),
                    ));
                    
                    if (existingProductUnit.length === 0) {
                        // Skip this item if product-unit combination doesn't exist
                        results.push({
                            maintainsId: stock.maintainsId,
                            productId: stock.productId,
                            unitId: stock.unitId,
                            action: 'skipped',
                            reason: 'Product-unit combination does not exist'
                        });
                        continue;
                    }
                    
                    const [inserted] = await tx.insert(stockTable).values({
                        ...stock,
                        pricePerQuantity: Number(stock.pricePerQuantity.toFixed(2)),
                        quantity: Number(stock.quantity.toFixed(3))
                    }).returning();
                    
                    results.push({
                        ...inserted,
                        action: 'created'
                    });
                }
            }
            
            return results;
        });
    }

    static async bulkCreateOrAddStock(stocks: NewStock[]) {
        return await db.transaction(async (tx) => {
            return await this.bulkCreateOrAddStockWithTx(stocks, tx);
        });
    }

    static async bulkCreateOrAddStockWithTx(stocks: NewStock[], tx: any) {
        const results = [];
        
        for (const stock of stocks) {
            // Check if stock exists with the same maintainsId, productId, unitId, and pricePerQuantity
            const existingStock = await tx.select().from(stockTable).where(and(
                eq(stockTable.maintainsId, stock.maintainsId),
                eq(stockTable.productId, stock.productId),
                eq(stockTable.unitId, stock.unitId),
                eq(stockTable.pricePerQuantity, stock.pricePerQuantity),
            ));
            
            // If stock exists with same price, add to existing quantity
            if (existingStock.length > 0) {
                const currentQuantity = parseFloat(existingStock[0].quantity.toString());
                const addQuantity = parseFloat(stock.quantity.toString());
                const newQuantity = Number((currentQuantity + addQuantity).toFixed(3));
                
                const [updated] = await tx.update(stockTable)
                    .set({
                        quantity: newQuantity,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockTable.id, existingStock[0].id))
                    .returning();
                
                results.push({
                    ...updated,
                    action: 'quantity_added',
                    previousQuantity: currentQuantity,
                    addedQuantity: addQuantity,
                    newQuantity: newQuantity
                });
            } 
            // If stock doesn't exist with same price, create new stock entry
            else {
                // Verify the product-unit combination exists
                const existingProductUnit = await tx.select().from(unitInProductTable).where(and(
                    eq(unitInProductTable.productId, stock.productId),
                    eq(unitInProductTable.unitId, stock.unitId),
                ));
                
                if (existingProductUnit.length === 0) {
                    // Skip this item if product-unit combination doesn't exist
                    results.push({
                        maintainsId: stock.maintainsId,
                        productId: stock.productId,
                        unitId: stock.unitId,
                        pricePerQuantity: stock.pricePerQuantity,
                        action: 'skipped',
                        reason: 'Product-unit combination does not exist'
                    });
                    continue;
                }
                
                const [inserted] = await tx.insert(stockTable).values({
                    ...stock,
                    pricePerQuantity: Number(stock.pricePerQuantity.toFixed(2)),
                    quantity: Number(stock.quantity.toFixed(3))
                }).returning();
                
                results.push({
                    ...inserted,
                    action: 'created'
                });
            }
        }
        
        return results;
    }

    static async bulkReduceStockWithTx(stocksToReduce: Array<{maintainsId: string, productId: string, unitId: string, quantity: number}>, tx: any) {
        const results = [];
        
        for (const stockReduction of stocksToReduce) {
            // Find the specific stock record that matches maintainsId, productId, and unitId
            const [primaryStockRecord] = await tx
                .select()
                .from(stockTable)
                .where(
                    and(
                        eq(stockTable.maintainsId, stockReduction.maintainsId),
                        eq(stockTable.productId, stockReduction.productId),
                        eq(stockTable.unitId, stockReduction.unitId)
                    )
                );

            if (!primaryStockRecord) {
                results.push({
                    maintainsId: stockReduction.maintainsId,
                    productId: stockReduction.productId,
                    unitId: stockReduction.unitId,
                    action: 'skipped',
                    reason: 'Primary stock record not found'
                });
                continue;
            }

            // Check if primary stock has sufficient quantity
            const newPrimaryQuantity = Number((primaryStockRecord.quantity - stockReduction.quantity).toFixed(3));
            if (newPrimaryQuantity < 0) {
                throw new Error(`Insufficient stock. Available: ${primaryStockRecord.quantity}, Required: ${stockReduction.quantity}`);
            }

            // Find all other stock records with same maintainsId and productId but different unitId
            const allStockRecords = await tx
                .select()
                .from(stockTable)
                .where(
                    and(
                        eq(stockTable.maintainsId, stockReduction.maintainsId),
                        eq(stockTable.productId, stockReduction.productId)
                    )
                );

            // Update the primary stock record directly
            const [updatedPrimary] = await tx
                .update(stockTable)
                .set({
                    quantity: newPrimaryQuantity,
                    updatedAt: getCurrentDate()
                })
                .where(eq(stockTable.id, primaryStockRecord.id))
                .returning();

            results.push({
                ...updatedPrimary,
                action: 'quantity_reduced_direct',
                previousQuantity: primaryStockRecord.quantity,
                reducedQuantity: stockReduction.quantity,
                newQuantity: newPrimaryQuantity
            });

            // Update other related stock records proportionally
            const otherStockRecords = allStockRecords.filter(record => record.id !== primaryStockRecord.id);
            
            for (const relatedStock of otherStockRecords) {
                // Calculate proportional reduction: (relatedStock.quantity / primaryStockRecord.quantity) * reductionQuantity
                const proportionalReduction = (relatedStock.quantity / primaryStockRecord.quantity) * stockReduction.quantity;
                const newRelatedQuantity = Number((relatedStock.quantity - proportionalReduction).toFixed(3));
                
                if (newRelatedQuantity < 0) {
                    throw new Error(`Insufficient stock in related record for proportional reduction. Available: ${relatedStock.quantity}, Required: ${proportionalReduction}`);
                }

                const [updatedRelated] = await tx
                    .update(stockTable)
                    .set({
                        quantity: newRelatedQuantity,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockTable.id, relatedStock.id))
                    .returning();

                results.push({
                    ...updatedRelated,
                    action: 'quantity_reduced_proportional',
                    previousQuantity: relatedStock.quantity,
                    reducedQuantity: proportionalReduction,
                    newQuantity: newRelatedQuantity
                });
            }
        }
        
        return results;
    }

    static async updateStock({ id, ...stock }: Partial<NewStock> & { id: string }) {
        const updatedStock = await db.transaction(async (tx) => {
            // Check if stock exists
            const existingStock = await tx.select().from(stockTable).where(eq(stockTable.id, id));
            if (existingStock.length === 0) {
                tx.rollback();
            }

            // If product or unit is being updated, check if the combination exists in unitInProduct
            if (stock.productId && stock.unitId) {
                const existingProductUnit = await tx.select().from(unitInProductTable).where(and(
                    eq(unitInProductTable.productId, stock.productId),
                    eq(unitInProductTable.unitId, stock.unitId),
                ));
                if (existingProductUnit.length === 0) {
                    tx.rollback();
                }
            }

            // Update the stock
            const [updated] = await tx.update(stockTable)
                .set({
                    ...stock,
                    ...(stock.pricePerQuantity && { pricePerQuantity: Number(stock.pricePerQuantity.toFixed(2)) }),
                    ...(stock.quantity && { quantity: Number(stock.quantity.toFixed(3)) }),
                    updatedAt: getCurrentDate()
                })
                .where(eq(stockTable.id, id))
                .returning();

            return updated;
        });

        return updatedStock;
    }

    static async deleteStock(id: string) {
        return await db.transaction(async (tx) => {
            // Check if stock exists
            const existingStock = await tx.select().from(stockTable).where(eq(stockTable.id, id));
            if (existingStock.length === 0) {
                tx.rollback();
            }

            // Delete the stock
            const [deleted] = await tx.delete(stockTable)
                .where(eq(stockTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getStocks(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await filterWithPaginate(stockTable, {
            pagination,
            filter,
            joins: [
                {
                    table: unitTable,
                    alias: 'unit',
                    condition: eq(stockTable.unitId, unitTable.id),
                    type: "inner"
                },
                {
                    table: productTable,
                    alias: 'product',
                    condition: eq(stockTable.productId, productTable.id)
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(maintainsTable.id, stockTable.maintainsId)
                }
            ],
            select: {
                "id": stockTable.id,
                "createdAt": stockTable.createdAt,
                "updatedAt": stockTable.updatedAt,
                "unit": sql`json_build_object('id', ${unitTable.id}, 'name', ${unitTable.name})`,
                "product": sql`json_build_object(
                    'id', ${productTable.id}, 
                    'name', ${productTable.name}, 
                    'bengaliName', ${productTable.bengaliName},
                    'sku', ${productTable.sku}
                )`,
                "maintains": sql`json_build_object('id', ${maintainsTable.id}, 'name', ${maintainsTable.name})`,
                "pricePerQuantity": stockTable.pricePerQuantity,
                "quantity": stockTable.quantity
            }
        });
    }
}