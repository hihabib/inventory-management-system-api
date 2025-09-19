import { eq, and, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewStock, stockTable } from "../drizzle/schema/stock";
import { unitInProductTable } from "../drizzle/schema/unitInProduct";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { unitTable } from "../drizzle/schema/unit";
import { productTable } from "../drizzle/schema/product";
import { maintainsTable } from "../drizzle/schema/maintains";


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
            const [insertedStock] = await tx.insert(stockTable).values({
                ...stock,
            }).returning();
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
                // Check if stock exists with the same maintainsId, productId, and unitId
                const existingStock = await tx.select().from(stockTable).where(and(
                    eq(stockTable.maintainsId, stock.maintainsId),
                    eq(stockTable.productId, stock.productId),
                    eq(stockTable.unitId, stock.unitId),
                ));
                
                // If stock exists, update it
                if (existingStock.length > 0) {
                    const [updated] = await tx.update(stockTable)
                        .set({
                            pricePerQuantity: stock.pricePerQuantity,
                            quantity: stock.quantity,
                            updatedAt: new Date()
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
                    const newQuantity = currentQuantity + addQuantity;
                    
                    const [updated] = await tx.update(stockTable)
                        .set({
                            quantity: newQuantity,
                            updatedAt: new Date()
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
                    updatedAt: new Date()
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