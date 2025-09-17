import { ProductCategoryInProductTable } from './../drizzle/schema/productCategoryInProduct';
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewProduct, productTable } from "../drizzle/schema/product";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { unitInProductTable } from "../drizzle/schema/unitInProduct";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { unitTable } from "../drizzle/schema/unit";
import { stockTable } from "../drizzle/schema/stock";
import { maintainsTable } from "../drizzle/schema/maintains";
import { productCategoryTable } from '../drizzle/schema/productCategory';

export class ProductService {
    static async createProduct({ categoriesId, unitsId, ...product }: NewProduct & { unitsId: string[], categoriesId: string[] }) {
        const insertedProduct = await db.transaction(async (tx) => {
            const existingProduct = await tx.select().from(productTable).where(eq(productTable.sku, product.sku));
            if (existingProduct.length > 0) {
                tx.rollback();
            }
            const [insertedProduct] = await tx.insert(productTable).values({
                ...product,
            }).returning();
            await tx.insert(unitInProductTable).values(unitsId.map(unitId => ({
                unitId,
                productId: insertedProduct.id
            }))).returning();
            await tx.insert(productCategoryInProductTable).values(categoriesId.map(categoryId => ({
                productCategoryId: categoryId,
                productId: insertedProduct.id
            }))).returning();
            return {
                ...insertedProduct,
                unitsId,
                categoriesId,
            }
        })
        return insertedProduct;
    }

    static async updateProduct({ categoriesId, unitsId, ...product }: Partial<NewProduct> & { id: string, unitsId?: string[], categoriesId?: string[] }) {
        const productId = product.id;
        const updatedProduct = await db.transaction(async (tx) => {
            // Check if product exists
            const existingProduct = await tx.select().from(productTable).where(eq(productTable.id, productId));
            if (existingProduct.length === 0) {
                throw new Error(`Product with id ${productId} not found`);
            }

            // Update product details
            const [updatedProduct] = await tx.update(productTable)
                .set({
                    ...product,
                    updatedAt: new Date()
                })
                .where(eq(productTable.id, productId))
                .returning();

            // Handle unit relationships if provided
            if (unitsId) {
                // Get existing unit relationships
                const existingUnits = await tx.select()
                    .from(unitInProductTable)
                    .where(eq(unitInProductTable.productId, productId));

                const existingUnitIds = existingUnits.map(u => u.unitId);

                // Find units to add (in unitsId but not in existingUnitIds)
                const unitsToAdd = unitsId.filter(id => !existingUnitIds.includes(id));

                // Find units to remove (in existingUnitIds but not in unitsId)
                const unitsToRemove = existingUnitIds.filter(id => !unitsId.includes(id));

                // Add new unit relationships
                if (unitsToAdd.length > 0) {
                    await tx.insert(unitInProductTable).values(
                        unitsToAdd.map(unitId => ({
                            unitId,
                            productId
                        }))
                    );
                }

                // Remove old unit relationships
                for (const unitId of unitsToRemove) {
                    await tx.delete(unitInProductTable)
                        .where(
                            and(
                                eq(unitInProductTable.productId, productId),
                                eq(unitInProductTable.unitId, unitId)
                            )
                        );
                }
            }

            // Handle category relationships if provided
            if (categoriesId) {
                // Get existing category relationships
                const existingCategories = await tx.select()
                    .from(productCategoryInProductTable)
                    .where(eq(productCategoryInProductTable.productId, productId));

                const existingCategoryIds = existingCategories.map(c => c.productCategoryId);

                // Find categories to add (in categoriesId but not in existingCategoryIds)
                const categoriesToAdd = categoriesId.filter(id => !existingCategoryIds.includes(id));

                // Find categories to remove (in existingCategoryIds but not in categoriesId)
                const categoriesToRemove = existingCategoryIds.filter(id => !categoriesId.includes(id));

                // Add new category relationships
                if (categoriesToAdd.length > 0) {
                    await tx.insert(productCategoryInProductTable).values(
                        categoriesToAdd.map(categoryId => ({
                            productCategoryId: categoryId,
                            productId
                        }))
                    );
                }

                // Remove old category relationships
                for (const categoryId of categoriesToRemove) {
                    await tx.delete(productCategoryInProductTable)
                        .where(
                            and(
                                eq(productCategoryInProductTable.productId, productId),
                                eq(productCategoryInProductTable.productCategoryId, categoryId)
                            )
                        );
                }
            }

            // Get updated unit and category IDs for the response
            const updatedUnits = await tx.select()
                .from(unitInProductTable)
                .where(eq(unitInProductTable.productId, productId));

            const updatedCategories = await tx.select()
                .from(productCategoryInProductTable)
                .where(eq(productCategoryInProductTable.productId, productId));

            return {
                ...updatedProduct,
                unitsId: updatedUnits.map(u => u.unitId),
                categoriesId: updatedCategories.map(c => c.productCategoryId)
            };
        });

        return updatedProduct;
    }

    static async deleteProduct(productId: string) {
        return await db.transaction(async (tx) => {
            // Check if product exists
            const existingProduct = await tx.select().from(productTable).where(eq(productTable.id, productId));
            if (existingProduct.length === 0) {
                throw new Error(`Product with id ${productId} not found`);
            }

            // Delete related records in unitInProductTable
            await tx.delete(unitInProductTable)
                .where(eq(unitInProductTable.productId, productId));

            // Delete related records in productCategoryInProductTable
            await tx.delete(productCategoryInProductTable)
                .where(eq(productCategoryInProductTable.productId, productId));

            // Delete the product
            const [deletedProduct] = await tx.delete(productTable)
                .where(eq(productTable.id, productId))
                .returning();

            return deletedProduct;
        });
    }

    static async getProductById(id: string) {
        // Step 1: Get product with main unit
        const product = await db
            .select({
                id: productTable.id,
                name: productTable.name,
                bengaliName: productTable.bengaliName,
                lowStockThreshold: productTable.lowStockThreshold,
                sku: productTable.sku,
                mainUnit: {
                    id: unitTable.id,
                    name: unitTable.name,
                    description: unitTable.description,
                    createdAt: unitTable.createdAt,
                    updatedAt: unitTable.updatedAt
                }
            })
            .from(productTable)
            .innerJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
            .where(eq(productTable.id, id))
            .limit(1);

        if (product.length === 0) {
            return null;
        }

        // Step 2: Get all units associated with this product
        const allUnits = await db
            .select({
                unitId: unitTable.id,
                name: unitTable.name,
                description: unitTable.description,
                createdAt: unitTable.createdAt,
                updatedAt: unitTable.updatedAt
            })
            .from(unitInProductTable)
            .innerJoin(unitTable, eq(unitInProductTable.unitId, unitTable.id))
            .where(eq(unitInProductTable.productId, id));
        
        // Step 3: Get stock information for this product
        const stockInfo = await db
            .select({
                productId: stockTable.productId,
                unitId: stockTable.unitId,
                unitName: unitTable.name,
                maintainsId: maintainsTable.id,
                maintainsName: maintainsTable.name,
                quantity: stockTable.quantity,
                pricePerQuantity: stockTable.pricePerQuantity
            })
            .from(stockTable)
            .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
            .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
            .where(eq(stockTable.productId, id));

        // Step 4: Get categories for this product
        const categoryInfo = await db
            .select({
                productId: productCategoryInProductTable.productId,
                categoryId: productCategoryTable.id,
                categoryName: productCategoryTable.name,
                createdAt: productCategoryTable.createdAt,
                updatedAt: productCategoryTable.updatedAt,
                description: productCategoryTable.description,
                parentId: productCategoryTable.parentId
            })
            .from(productCategoryInProductTable)
            .innerJoin(productCategoryTable, eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id))
            .where(eq(productCategoryInProductTable.productId, id));

        // Step 5: Process and combine results
        const productDetail = product[0];
        
        // Group by maintain name
        const stockByMaintain = {};
        stockInfo.forEach(stock => {
            if (!stockByMaintain[stock.maintainsName]) {
                stockByMaintain[stock.maintainsName] = [];
            }
            stockByMaintain[stock.maintainsName].push({
                maintainsId: stock.maintainsId,
                maintainsName: stock.maintainsName,
                unitId: stock.unitId,
                unitName: stock.unitName,
                quantity: stock.quantity,
                pricePerQuantity: stock.pricePerQuantity
            });
        });

        // Get categories for this product
        const categories = categoryInfo.map(cat => ({
            id: cat.categoryId,
            name: cat.categoryName,
            description: cat.description,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt,
            parentId: cat.parentId
        }));

        // Format units for this product
        const units = allUnits.map(unit => ({
            id: unit.unitId,
            name: unit.name,
            description: unit.description,
            createdAt: unit.createdAt,
            updatedAt: unit.updatedAt
        }));

        return {
            ...productDetail,
            stocks: stockByMaintain,
            categories,
            units // Add all associated units to the response
        };
    }

    static async getProducts(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        // Step 1: Get products with main unit
        
        const productsResult = await filterWithPaginate(productTable, {
            pagination,
            filter: {
                ...filter,
            },
            joins: [
                {
                    table: unitTable,
                    alias: 'mainUnit',
                    condition: eq(productTable.mainUnitId, unitTable.id)
                },
                {
                    table: stockTable,
                    alias: 'stock',
                    condition: eq(stockTable.productId, productTable.id)
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(stockTable.maintainsId, maintainsTable.id)
                }
            ],
            select: {
                id: productTable.id,
                name: productTable.name,
                bengaliName: productTable.bengaliName,
                lowStockThreshold: productTable.lowStockThreshold,
                sku: productTable.sku,
                mainUnit: {
                    id: unitTable.id,
                    name: unitTable.name,
                    description: unitTable.description,
                    createdAt: unitTable.createdAt,
                    updatedAt: unitTable.updatedAt
                }
            },
            groupBy: [
                productTable.id, 
                productTable.name, 
                productTable.bengaliName, 
                productTable.lowStockThreshold, 
                productTable.sku,
                unitTable.id,
                unitTable.name,
                unitTable.description,
                unitTable.createdAt,
                unitTable.updatedAt
            ]
        });

        // Step 2: Get stock information for these products
        const productIds = productsResult.list.map(p => p.id);
        const stockInfo = await db
            .select({
                productId: stockTable.productId,
                unitId: stockTable.unitId,
                unitName: unitTable.name,
                maintainsId: maintainsTable.id,
                maintainsName: maintainsTable.name,
                quantity: stockTable.quantity,
                pricePerQuantity: stockTable.pricePerQuantity
            })
            .from(stockTable)
            .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
            .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
            .where(inArray(stockTable.productId, productIds));

        // Step 3: Get all units associated with these products
        const allUnits = await db
            .select({
                productId: unitInProductTable.productId,
                unitId: unitTable.id,
                name: unitTable.name,
                description: unitTable.description,
                createdAt: unitTable.createdAt,
                updatedAt: unitTable.updatedAt
            })
            .from(unitInProductTable)
            .innerJoin(unitTable, eq(unitInProductTable.unitId, unitTable.id))
            .where(inArray(unitInProductTable.productId, productIds));

        // Step 4: Get categories for these products
        const categoryInfo = await db
            .select({
                productId: productCategoryInProductTable.productId,
                categoryId: productCategoryTable.id,
                categoryName: productCategoryTable.name,
                createdAt: productCategoryTable.createdAt,
                updatedAt: productCategoryTable.updatedAt,
                description: productCategoryTable.description,
                parentId: productCategoryTable.parentId
            })
            .from(productCategoryInProductTable)
            .innerJoin(productCategoryTable, eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id))
            .where(inArray(productCategoryInProductTable.productId, productIds));

        // Step 5: Process and combine results
        const productsWithStock = productsResult.list.map(product => {
            // Get all stock records for this product
            const productStocks = stockInfo.filter(s => s.productId === product.id);

            // Group by maintain name
            const stockByMaintain = {};
            productStocks.forEach(stock => {
                if (!stockByMaintain[stock.maintainsName]) {
                    stockByMaintain[stock.maintainsName] = [];
                }
                stockByMaintain[stock.maintainsName].push({
                    maintainsId: stock.maintainsId,
                    unitId: stock.unitId,
                    maintainsName: stock.maintainsName,
                    quantity: stock.quantity,
                    unitName: stock.unitName,
                    pricePerQuantity: stock.pricePerQuantity
                });
            });

            // Get categories for this product
            const productCategories = categoryInfo
                .filter(c => c.productId === product.id)
                .map(c => ({ id: c.categoryId, name: c.categoryName, description: c.description, parentId: c.parentId, createdAt: c.createdAt, updatedAt: c.updatedAt }));
                
            // Get all units for this product
            const productUnits = allUnits
                .filter(u => u.productId === product.id)
                .map(u => ({ id: u.unitId, name: u.name, description: u.description, createdAt: u.createdAt, updatedAt: u.updatedAt }));

            return {
                ...product,
                stocks: stockByMaintain,
                categories: productCategories,
                units: productUnits
            };
        });

        return {
            list: productsWithStock,
            pagination: productsResult.pagination
        };
    }
}