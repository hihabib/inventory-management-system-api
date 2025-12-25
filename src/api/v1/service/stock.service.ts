import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { maintainsTable } from "../drizzle/schema/maintains";
import { productTable } from "../drizzle/schema/product";
import { NewStock, stockTable } from "../drizzle/schema/stock";
import { stockBatchTable } from "../drizzle/schema/stockBatch";
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
                            pricePerQuantity: parseFloat(stock.pricePerQuantity.toFixed(2)),
                            quantity: parseFloat(stock.quantity.toFixed(3)),
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
                        pricePerQuantity: parseFloat(stock.pricePerQuantity.toFixed(2)),
                        quantity: parseFloat(stock.quantity.toFixed(3))
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
                },
                {
                    table: stockBatchTable,
                    alias: 'stockBatch',
                    condition: and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)),
                    type: "left"
                }
            ],
            select: {
                "id": stockTable.id,
                "createdAt": stockTable.createdAt,
                "updatedAt": stockTable.updatedAt,
                "stockBatchId": stockTable.stockBatchId,
                "unit": sql`json_build_object('id', ${unitTable.id}, 'name', ${unitTable.name})`,
                "product": sql`json_build_object(
                    'id', ${productTable.id}, 
                    'name', ${productTable.name}, 
                    'bengaliName', ${productTable.bengaliName},
                    'sku', ${productTable.sku}
                )`,
                "maintains": sql`json_build_object('id', ${maintainsTable.id}, 'name', ${maintainsTable.name})`,
                "stockBatch": sql`CASE 
                    WHEN ${stockBatchTable.id} IS NOT NULL THEN 
                        json_build_object(
                            'id', ${stockBatchTable.id}, 
                            'batchNumber', ${stockBatchTable.batchNumber},
                            'productionDate', ${stockBatchTable.productionDate}
                        )
                    ELSE NULL 
                END`,
                "pricePerQuantity": stockTable.pricePerQuantity,
                "quantity": stockTable.quantity
            }
        });
    }

    /**
     * Get stocks with batch information
     */
    static async getStocksWithBatch(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await this.getStocks(pagination, filter);
    }

    /**
     * Get stock by ID with batch information
     */
    static async getStockByIdWithBatch(stockId: string) {
        const [stock] = await db.select({
            id: stockTable.id,
            createdAt: stockTable.createdAt,
            updatedAt: stockTable.updatedAt,
            stockBatchId: stockTable.stockBatchId,
            productId: stockTable.productId,
            maintainsId: stockTable.maintainsId,
            unitId: stockTable.unitId,
            pricePerQuantity: stockTable.pricePerQuantity,
            quantity: stockTable.quantity,
            unit: {
                id: unitTable.id,
                name: unitTable.name,
                description: unitTable.description
            },
            product: {
                id: productTable.id,
                name: productTable.name,
                bengaliName: productTable.bengaliName,
                sku: productTable.sku
            },
            maintains: {
                id: maintainsTable.id,
                name: maintainsTable.name,
                type: maintainsTable.type
            },
            stockBatch: {
                id: stockBatchTable.id,
                batchNumber: stockBatchTable.batchNumber,
                productionDate: stockBatchTable.productionDate
            }
        })
        .from(stockTable)
        .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
        .innerJoin(productTable, eq(stockTable.productId, productTable.id))
        .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
        .leftJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
        .where(eq(stockTable.id, stockId));

        return stock;
    }

    /**
     * Get stocks by batch ID
     */
    static async getStocksByBatchId(batchId: string) {
        return await db.select({
            id: stockTable.id,
            createdAt: stockTable.createdAt,
            updatedAt: stockTable.updatedAt,
            stockBatchId: stockTable.stockBatchId,
            productId: stockTable.productId,
            maintainsId: stockTable.maintainsId,
            unitId: stockTable.unitId,
            pricePerQuantity: stockTable.pricePerQuantity,
            quantity: stockTable.quantity,
            unit: {
                id: unitTable.id,
                name: unitTable.name,
                description: unitTable.description
            }
        })
        .from(stockTable)
        .innerJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
        .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
        .where(and(eq(stockTable.stockBatchId, batchId), eq(stockBatchTable.id, batchId)));
    }

    /**
     * Check if stock has sufficient quantity
     */
    static async checkStockAvailability(stockId: string, requiredQuantity: number) {
        const [stock] = await db.select({
            id: stockTable.id,
            quantity: stockTable.quantity,
            productId: stockTable.productId,
            unitId: stockTable.unitId,
            maintainsId: stockTable.maintainsId
        })
        .from(stockTable)
        .where(eq(stockTable.id, stockId));

        if (!stock) {
            throw new Error(`Stock not found with ID: ${stockId}`);
        }

        return {
            available: stock.quantity >= requiredQuantity,
            currentQuantity: stock.quantity,
            requiredQuantity,
            stock
        };
    }
}
