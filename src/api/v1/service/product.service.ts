import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewProduct, productTable } from "../drizzle/schema/product";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { unitInProductTable } from "../drizzle/schema/unitInProduct";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { unitTable } from "../drizzle/schema/unit";
import { stockTable } from "../drizzle/schema/stock";
import { maintainsTable } from "../drizzle/schema/maintains";
import { productCategoryTable } from '../drizzle/schema/productCategory';
import { getCurrentDate } from '../utils/timezone';
import { stockBatchTable } from '../drizzle/schema/stockBatch';
import { ProductCategoryService } from "./productCategory.service";


export class ProductService {
    /**
     * Create product with units and their conversion factors
     */
    static async createProductWithUnits({ 
        categoriesId, 
        unitConversions, 
        ...product 
    }: NewProduct & { 
        unitConversions: Array<{ unitId: string; conversionFactor: number }>, 
        categoriesId: string[] 
    }) {
        const insertedProduct = await db.transaction(async (tx) => {
            // Check if product with same SKU exists
            const existingProduct = await tx.select().from(productTable).where(eq(productTable.sku, product.sku));
            if (existingProduct.length > 0) {
                throw new Error(`Product with SKU ${product.sku} already exists`);
            }

            // Create the product
            const [insertedProduct] = await tx.insert(productTable).values({
                ...product,
            }).returning();

            // Extract unit IDs from conversions
            const unitsId = unitConversions.map(uc => uc.unitId);

            // Create unit-product relationships
            await tx.insert(unitInProductTable).values(unitsId.map(unitId => ({
                unitId,
                productId: insertedProduct.id
            })));

            // Create unit conversions
            await tx.insert(unitConversionTable).values(unitConversions.map(uc => ({
                productId: insertedProduct.id,
                unitId: uc.unitId,
                conversionFactor: Number(uc.conversionFactor.toFixed(6))
            })));

            // Create category relationships
            if (categoriesId && categoriesId.length > 0) {
                await tx.insert(productCategoryInProductTable).values(categoriesId.map(categoryId => ({
                    productCategoryId: categoryId,
                    productId: insertedProduct.id
                })));
            }

            return {
                ...insertedProduct,
                unitConversions,
                categoriesId,
            };
        });

        return insertedProduct;
    }

    /**
     * Update product with unit conversions
     */
    static async updateProductWithUnits({ 
        categoriesId, 
        unitConversions, 
        ...product 
    }: Partial<NewProduct> & { 
        id: string, 
        unitConversions?: Array<{ unitId: string; conversionFactor: number }>, 
        categoriesId?: string[] 
    }) {
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
                    updatedAt: getCurrentDate()
                })
                .where(eq(productTable.id, productId))
                .returning();

            // Handle unit conversions if provided
            if (unitConversions) {
                // Get existing unit relationships and conversions
                const existingUnits = await tx.select()
                    .from(unitInProductTable)
                    .where(eq(unitInProductTable.productId, productId));

                const existingConversions = await tx.select()
                    .from(unitConversionTable)
                    .where(eq(unitConversionTable.productId, productId));

                const existingUnitIds = existingUnits.map(u => u.unitId);
                const newUnitIds = unitConversions.map(uc => uc.unitId);

                // Find units to add and remove
                const unitsToAdd = newUnitIds.filter(id => !existingUnitIds.includes(id));
                const unitsToRemove = existingUnitIds.filter(id => !newUnitIds.includes(id));

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

                // Update unit conversions
                // Delete existing conversions
                await tx.delete(unitConversionTable)
                    .where(eq(unitConversionTable.productId, productId));

                // Insert new conversions
                await tx.insert(unitConversionTable).values(unitConversions.map(uc => ({
                    productId,
                    unitId: uc.unitId,
                    conversionFactor: Number(uc.conversionFactor.toFixed(6))
                })));
            }

            // Handle category relationships if provided
            if (categoriesId) {
                // Get existing category relationships
                const existingCategories = await tx.select()
                    .from(productCategoryInProductTable)
                    .where(eq(productCategoryInProductTable.productId, productId));

                const existingCategoryIds = existingCategories.map(c => c.productCategoryId);

                // Find categories to add and remove
                const categoriesToAdd = categoriesId.filter(id => !existingCategoryIds.includes(id));
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

            // Get updated unit conversions and category IDs for the response
            const updatedConversions = await tx.select()
                .from(unitConversionTable)
                .where(eq(unitConversionTable.productId, productId));

            const updatedCategories = await tx.select()
                .from(productCategoryInProductTable)
                .where(eq(productCategoryInProductTable.productId, productId));

            return {
                ...updatedProduct,
                unitConversions: updatedConversions.map(uc => ({
                    unitId: uc.unitId,
                    conversionFactor: uc.conversionFactor
                })),
                categoriesId: updatedCategories.map(c => c.productCategoryId)
            };
        });

        return updatedProduct;
    }

    /**
     * Get unit conversions for a product
     */
    static async getProductUnitConversions(productId: string) {
        return await db.select({
            unitId: unitConversionTable.unitId,
            conversionFactor: unitConversionTable.conversionFactor,
            unit: {
                id: unitTable.id,
                name: unitTable.name,
                description: unitTable.description
            }
        })
        .from(unitConversionTable)
        .innerJoin(unitTable, eq(unitConversionTable.unitId, unitTable.id))
        .where(eq(unitConversionTable.productId, productId));
    }

    static async deleteProduct(productId: string) {
        return await db.transaction(async (tx) => {
            // Check if product exists
            const existingProduct = await tx.select().from(productTable).where(eq(productTable.id, productId));
            if (existingProduct.length === 0) {
                throw new Error(`Product with id ${productId} not found`);
            }

            // Set quantity to 0 for related stock entries
            await tx.update(stockTable)
                .set({ quantity: 0 })
                .where(eq(stockTable.productId, productId));

// Soft delete the product
            const [softDeletedProduct] = await tx.update(productTable)
                .set({
                    isDeleted: true,
                    deletedAt: new Date()
                })
                .where(eq(productTable.id, productId))
                .returning();

            return softDeletedProduct;
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
                isActive: productTable.isActive,
                defaultOrderUnit: productTable.defaultOrderUnit,
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

        // Step 2.1: Get unit conversions for this product
        const unitConversions = await db
            .select({
                unitId: unitConversionTable.unitId,
                conversionFactor: unitConversionTable.conversionFactor,
                unitName: unitTable.name,
                unitDescription: unitTable.description,
                unitCreatedAt: unitTable.createdAt,
                unitUpdatedAt: unitTable.updatedAt
            })
            .from(unitConversionTable)
            .innerJoin(unitTable, eq(unitConversionTable.unitId, unitTable.id))
            .where(eq(unitConversionTable.productId, id));

        // Step 3: Get stock information for this product
        const stockInfo = await db
            .select({
                stockId: stockTable.id,
                stockBatchId: stockTable.stockBatchId,
                stockBatchCreatedAt: stockBatchTable.createdAt,
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
            .innerJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
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
                stockId: stock.stockId,
                stockBatchId: stock.stockBatchId,
                stockBatchCreatedAt: stock.stockBatchCreatedAt,
                maintainsId: stock.maintainsId,
                maintainsName: stock.maintainsName,
                unitId: stock.unitId,
                unitName: stock.unitName,
                quantity: stock.quantity,
                pricePerQuantity: stock.pricePerQuantity
            });
        });

        // Get categories for this product
        const categories = await Promise.all(categoryInfo.map(async (cat) => ({
            id: cat.categoryId,
            name: cat.categoryName,
            description: cat.description,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt,
            parentId: cat.parentId,
            vat: await ProductCategoryService.findEffectiveVat(cat.categoryId)
        })));

        // Format units for this product
        const units = allUnits.map(unit => ({
            id: unit.unitId,
            name: unit.name,
            description: unit.description,
            createdAt: unit.createdAt,
            updatedAt: unit.updatedAt
        }));

        // Format unit conversions for this product
        const unitConversionsFormatted = unitConversions.map(conversion => ({
            unitId: conversion.unitId,
            conversionFactor: conversion.conversionFactor,
            unit: {
                id: conversion.unitId,
                name: conversion.unitName,
                description: conversion.unitDescription,
                createdAt: conversion.unitCreatedAt,
                updatedAt: conversion.unitUpdatedAt
            }
        }));

        // Compute lastOrderHistory for all Maintains of type 'Outlet' at the DB level
        const lastOrderHistoryResult = await db.execute(sql`
            SELECT COALESCE(
                jsonb_object_agg(
                    m.name,
                    jsonb_build_object(
                        'quantity', dh.ordered_quantity,
                        'unit', dh.ordered_unit,
                        'orderedAt', to_char(COALESCE(dh.ordered_at, dh.created_at), 'YYYY-MM-DD HH24:MI:SS')
                    )
                ) FILTER (WHERE dh.id IS NOT NULL),
                '{}'::jsonb
            ) AS last_order_history
            FROM maintains m
            LEFT JOIN LATERAL (
                SELECT dh.*
                FROM delivery_history dh
                WHERE dh.product_id = ${id}::uuid
                  AND dh.maintains_id = m.id
                ORDER BY COALESCE(dh.ordered_at, dh.created_at) DESC
                LIMIT 1
            ) dh ON true
            WHERE m.type = 'Outlet'
        `);
        const lastOrderHistory = (lastOrderHistoryResult?.rows?.[0]?.last_order_history) ?? {};

        return {
            ...productDetail,
            stocks: stockByMaintain,
            categories,
            units, // Add all associated units to the response
            unitConversions: unitConversionsFormatted, // Add unit conversions to the response
            lastOrderHistory
        };
    }

    static async getProducts(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        // Handle hierarchical category filtering
        let modifiedFilter = { ...filter };
        
        // Handle isActive filtering
        // If includeInActive is not explicitly true, default to showing only active products
        const includeInActive = modifiedFilter['includeInActive']?.[0] === 'true';
        delete modifiedFilter['includeInActive'];

        if (!includeInActive) {
            modifiedFilter['isActive'] = [true];
        }

        if (filter && filter['productCategory.id']) {
            const categoryIds = Array.isArray(filter['productCategory.id']) 
                ? filter['productCategory.id'] 
                : [filter['productCategory.id']];
            
            // Get all child categories for each provided category ID
            const allCategoryIds = new Set(categoryIds);
            
            for (const categoryId of categoryIds) {
                const childCategories = await this.getAllChildCategories(categoryId);
                childCategories.forEach(id => allCategoryIds.add(id));
            }
            
            // Update the filter to include all category IDs (parent + children)
            modifiedFilter['productCategory.id'] = Array.from(allCategoryIds);
        }

        // Step 1: Get products with main unit
        const productsResult = await filterWithPaginate(productTable, {
            pagination,
            filter: {
                'isDeleted': [false],
                ...modifiedFilter,
            },
            orderBy: asc(productTable.sku),
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
                },
                {
                    table: productCategoryInProductTable,
                    alias: 'productCategoryInProduct',
                    condition: eq(productCategoryInProductTable.productId, productTable.id)
                },
                {
                    table: productCategoryTable,
                    alias: 'productCategory',
                    condition: eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id)
                }
            ],
            select: {
                id: productTable.id,
                name: productTable.name,
                bengaliName: productTable.bengaliName,
                lowStockThreshold: productTable.lowStockThreshold,
                sku: productTable.sku,
                isActive: productTable.isActive,
                defaultOrderUnit: productTable.defaultOrderUnit,
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
                productTable.isActive,
                productTable.defaultOrderUnit,
                unitTable.id,
                unitTable.name,
                unitTable.description,
                unitTable.createdAt,
                unitTable.updatedAt,
                productCategoryInProductTable.productId,
                productCategoryInProductTable.productCategoryId,
                productCategoryTable.id,
                productCategoryTable.name,
                productCategoryTable.description,
                productCategoryTable.parentId,
                productCategoryTable.createdAt,
                productCategoryTable.updatedAt
            ]
        });

        // Step 2: Get stock information for these products
        const productIds = productsResult.list.map(p => p.id);

        // Compute lastOrderHistory for each productId using DB-level aggregation
        const lastOrderByProduct: Record<string, any> = {};
        if (productIds.length > 0) {
            const idsList = sql`${sql.join(productIds.map(id => sql`${id}::uuid`), sql`,`)}`;
            const lastOrderAllResult = await db.execute(sql`
                WITH dh_latest AS (
                    SELECT DISTINCT ON (dh.product_id, dh.maintains_id)
                        dh.product_id,
                        dh.maintains_id,
                        dh.ordered_quantity,
                        dh.ordered_unit,
                        COALESCE(dh.ordered_at, dh.created_at) AS ordered_ts
                    FROM delivery_history dh
                    JOIN maintains m ON m.id = dh.maintains_id AND m.type = 'Outlet'
                    WHERE dh.product_id IN (${idsList})
                    ORDER BY dh.product_id, dh.maintains_id, COALESCE(dh.ordered_at, dh.created_at) DESC
                )
                SELECT 
                    dl.product_id,
                    COALESCE(
                        jsonb_object_agg(
                            m.name,
                            jsonb_build_object(
                                'quantity', dl.ordered_quantity,
                                'unit', dl.ordered_unit,
                                'orderedAt', to_char(dl.ordered_ts, 'YYYY-MM-DD HH24:MI:SS')
                            )
                        ),
                        '{}'::jsonb
                    ) AS last_order_history
                FROM dh_latest dl
                JOIN maintains m ON m.id = dl.maintains_id
                GROUP BY dl.product_id
            `);
            for (const row of lastOrderAllResult.rows as Array<{ product_id: string; last_order_history: any }>) {
                lastOrderByProduct[row.product_id] = row.last_order_history ?? {};
            }
        }
        const stockInfo = await db
            .select({
                id: stockTable.id,
                createdAt: stockTable.createdAt,
                productId: stockTable.productId,
                unitId: stockTable.unitId,
                unitName: unitTable.name,
                maintainsId: maintainsTable.id,
                maintainsName: maintainsTable.name,
                quantity: stockTable.quantity,
                pricePerQuantity: stockTable.pricePerQuantity,
                stockBatchId: stockTable.stockBatchId,
                stockBatchCreatedAt: stockBatchTable.createdAt
            })
            .from(stockTable)
            .innerJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
            .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
            .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
            .where(inArray(stockTable.productId, productIds))

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

        // Step 4.1: Get unit conversions for these products
        const unitConversionsInfo = await db
            .select({
                productId: unitConversionTable.productId,
                unitId: unitConversionTable.unitId,
                conversionFactor: unitConversionTable.conversionFactor,
                unitName: unitTable.name,
                unitDescription: unitTable.description,
                unitCreatedAt: unitTable.createdAt,
                unitUpdatedAt: unitTable.updatedAt
            })
            .from(unitConversionTable)
            .innerJoin(unitTable, eq(unitConversionTable.unitId, unitTable.id))
            .where(inArray(unitConversionTable.productId, productIds));

        // Step 5: Process and combine results
        // Get effective VAT for all categories found
        const uniqueCategoryIds = [...new Set(categoryInfo.map(c => c.categoryId))];
        const categoryVatMap = new Map<string, number | null>();

        await Promise.all(uniqueCategoryIds.map(async (id) => {
            const vat = await ProductCategoryService.findEffectiveVat(id);
            categoryVatMap.set(id, vat);
        }));

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
                    stockId: stock.id,
                    stockBatchId: stock.stockBatchId,
                    stockBatchCreatedAt: stock.stockBatchCreatedAt,
                    createdAt: stock.createdAt,
                    maintainsId: stock.maintainsId,
                    unitId: stock.unitId,
                    maintainsName: stock.maintainsName,
                    quantity: parseFloat(stock.quantity.toFixed(3)),
                    unitName: stock.unitName,
                    pricePerQuantity: stock.pricePerQuantity,
                });
            });

            // Get categories for this product
            const productCategories = categoryInfo
                .filter(c => c.productId === product.id)
                .map(c => ({ 
                    id: c.categoryId, 
                    name: c.categoryName, 
                    description: c.description, 
                    parentId: c.parentId, 
                    createdAt: c.createdAt, 
                    updatedAt: c.updatedAt,
                    vat: categoryVatMap.get(c.categoryId) ?? null
                }));

            // Get all units for this product
            const productUnits = allUnits
                .filter(u => u.productId === product.id)
                .map(u => ({ id: u.unitId, name: u.name, description: u.description, createdAt: u.createdAt, updatedAt: u.updatedAt }));

            // Get unit conversions for this product
            const productUnitConversions = unitConversionsInfo
                .filter(uc => uc.productId === product.id)
                .map(uc => ({
                    unitId: uc.unitId,
                    conversionFactor: uc.conversionFactor,
                    unit: {
                        id: uc.unitId,
                        name: uc.unitName,
                        description: uc.unitDescription,
                        createdAt: uc.unitCreatedAt,
                        updatedAt: uc.unitUpdatedAt
                    }
                }));

            return {
                ...product,
                stocks: stockByMaintain,
                categories: productCategories,
                units: productUnits,
                unitConversions: productUnitConversions,
                lastOrderHistory: lastOrderByProduct[product.id] ?? {}
            };
        });

        return {
            list: productsWithStock,
            pagination: productsResult.pagination
        };
    }

    /**
     * Recursively get all child category IDs for a given parent category ID
     * @param parentCategoryId - The parent category ID
     * @returns Array of child category IDs
     */
    private static async getAllChildCategories(parentCategoryId: string): Promise<string[]> {
        const childCategories = await db
            .select({ id: productCategoryTable.id })
            .from(productCategoryTable)
            .where(eq(productCategoryTable.parentId, parentCategoryId));

        const childIds: string[] = [];
        
        for (const child of childCategories) {
            childIds.push(child.id);
            // Recursively get children of this child
            const grandChildren = await this.getAllChildCategories(child.id);
            childIds.push(...grandChildren);
        }

        return childIds;
    }
}
