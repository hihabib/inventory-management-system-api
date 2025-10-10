import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { maintainsTable } from "../drizzle/schema/maintains";
import { productTable } from "../drizzle/schema/product";
import { stockTable } from "../drizzle/schema/stock";
import { stockBatchTable } from "../drizzle/schema/stockBatch";
import { unitTable } from "../drizzle/schema/unit";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { unitInProductTable } from "../drizzle/schema/unitInProduct";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";
import { randomUUID } from "crypto";

export class StockBatchService {

    /**
     * Create a new stock batch with automatic quantity calculation and manual unit pricing
     * Accepts main unit quantity for auto-calculation and manual prices for each unit
     */
    static async addNewStockBatch(batchData: {
        productId: string;
        maintainsId: string;
        batchNumber: string;
        productionDate?: Date;
        mainUnitQuantity: number;
        unitPrices: Array<{ unitId: string; pricePerQuantity: number }>;
    }) {
        console.log('🚀 [StockBatchService] Starting addNewStockBatch with data:', JSON.stringify(batchData, null, 2));

        return await db.transaction(async (tx) => {
            console.log('📦 [StockBatchService] Creating stock batch for product:', batchData.productId);

            // Get product information including mainUnitId
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, batchData.productId));

            if (!product) {
                throw new Error(`Product not found with ID: ${batchData.productId}`);
            }

            if (!product.mainUnitId) {
                throw new Error(`Product ${batchData.productId} does not have a main unit defined`);
            }

            console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

            // Check and remove empty stock batches for this product and outlet before creating new batch
            console.log('🧹 [StockBatchService] Checking for empty stock batches to cleanup...');
            
            try {
                // Find all stock batches for this product and outlet
                const existingBatches = await tx.select({
                    id: stockBatchTable.id,
                    batchNumber: stockBatchTable.batchNumber
                })
                .from(stockBatchTable)
                .where(and(
                    eq(stockBatchTable.productId, batchData.productId),
                    eq(stockBatchTable.maintainsId, batchData.maintainsId)
                ));

                console.log('📊 [StockBatchService] Found', existingBatches.length, 'existing batches for this product-outlet combination');

                const emptyBatchesToRemove = [];

                // Check each batch for empty stock
                for (const batch of existingBatches) {
                    const stockEntries = await tx.select({
                        id: stockTable.id,
                        quantity: stockTable.quantity
                    })
                    .from(stockTable)
                    .where(eq(stockTable.stockBatchId, batch.id));

                    const totalQuantity = stockEntries.reduce((sum, stock) => sum + stock.quantity, 0);
                    
                    if (totalQuantity === 0) {
                        emptyBatchesToRemove.push({
                            batchId: batch.id,
                            batchNumber: batch.batchNumber,
                            stockIds: stockEntries.map(s => s.id)
                        });
                        console.log('🗑️ [StockBatchService] Found empty batch to remove:', batch.batchNumber, 'with total quantity:', totalQuantity);
                    }
                }

                // Remove empty batches and their stock entries
                if (emptyBatchesToRemove.length > 0) {
                    console.log('🧹 [StockBatchService] Removing', emptyBatchesToRemove.length, 'empty batches...');
                    
                    for (const emptyBatch of emptyBatchesToRemove) {
                        // First, delete all stock entries for this batch
                        if (emptyBatch.stockIds.length > 0) {
                            await tx.delete(stockTable)
                                .where(inArray(stockTable.id, emptyBatch.stockIds));
                            console.log('✅ [StockBatchService] Deleted', emptyBatch.stockIds.length, 'stock entries for batch:', emptyBatch.batchNumber);
                        }

                        // Then, delete the batch itself
                        await tx.delete(stockBatchTable)
                            .where(eq(stockBatchTable.id, emptyBatch.batchId));
                        console.log('✅ [StockBatchService] Deleted empty batch:', emptyBatch.batchNumber);
                    }
                    
                    console.log('🎉 [StockBatchService] Successfully cleaned up', emptyBatchesToRemove.length, 'empty batches');
                } else {
                    console.log('✨ [StockBatchService] No empty batches found to cleanup');
                }
            } catch (cleanupError) {
                console.error('❌ [StockBatchService] Error during empty batch cleanup:', cleanupError);
                throw new Error(`Failed to cleanup empty batches: ${cleanupError.message}`);
            }

            // Get all unit conversions for this product
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, batchData.productId));

            if (unitConversions.length === 0) {
                throw new Error(`No unit conversions found for product ${batchData.productId}`);
            }

            console.log('📊 [StockBatchService] Found', unitConversions.length, 'unit conversions');

            // Find the main unit conversion factor
            const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
            if (!mainUnitConversion) {
                throw new Error(`Main unit conversion not found for product ${batchData.productId}`);
            }

            console.log('🎯 [StockBatchService] Main unit conversion factor:', mainUnitConversion.conversionFactor);

            // Create the stock batch
            const [stockBatch] = await tx.insert(stockBatchTable).values({
                productId: batchData.productId,
                maintainsId: batchData.maintainsId,
                batchNumber: batchData.batchNumber,
                productionDate: batchData.productionDate || getCurrentDate()
            }).returning();

            console.log('✅ [StockBatchService] Stock batch created successfully:', stockBatch);

            const stockResults = [];

            console.log('🔄 [StockBatchService] Processing automatic unit conversions for', unitConversions.length, 'units');

            // Create stock entries for all units based on conversions
            for (const unitConversion of unitConversions) {
                console.log('📋 [StockBatchService] Processing unit conversion:', unitConversion);

                // Verify the product-unit combination exists
                const existingProductUnit = await tx.select().from(unitInProductTable).where(and(
                    eq(unitInProductTable.productId, batchData.productId),
                    eq(unitInProductTable.unitId, unitConversion.unitId),
                ));

                if (existingProductUnit.length === 0) {
                    console.warn('⚠️ [StockBatchService] Product-unit combination not found, skipping:', {
                        productId: batchData.productId,
                        unitId: unitConversion.unitId
                    });
                    continue;
                }

                // Calculate quantity for this unit based on conversion factor
                // Formula: mainUnitQuantity * (thisUnitConversionFactor / mainUnitConversionFactor)
                const calculatedQuantity = Number(
                    (batchData.mainUnitQuantity * (unitConversion.conversionFactor / mainUnitConversion.conversionFactor)).toFixed(3)
                );

                // Find manual price for this unit
                const unitPrice = batchData.unitPrices.find(up => up.unitId === unitConversion.unitId);
                if (!unitPrice) {
                    throw new Error(`Price not provided for unit ${unitConversion.unitId}`);
                }

                console.log('🧮 [StockBatchService] Calculated for unit', unitConversion.unitId, ':', {
                    quantity: calculatedQuantity,
                    pricePerQuantity: unitPrice.pricePerQuantity
                });

                const [stock] = await tx.insert(stockTable).values({
                    stockBatchId: stockBatch.id,
                    productId: batchData.productId,
                    maintainsId: batchData.maintainsId,
                    unitId: unitConversion.unitId,
                    pricePerQuantity: unitPrice.pricePerQuantity,
                    quantity: calculatedQuantity
                }).returning();

                console.log('✅ [StockBatchService] Stock entry created:', stock);
                stockResults.push(stock);
            }

            console.log('🎉 [StockBatchService] All stock entries processed successfully. Total:', stockResults.length);

            return {
                batch: stockBatch,
                stocks: stockResults
            };
        });
    }

    /**
     * Process sale by specific stock ID with any unit quantity input
     * Now accepts quantity in any unit and automatically reduces all units proportionally
     */
    static async processSaleByStockId(stockId: string, unitId: string, quantityToReduce: number) {
        console.log('🚀 [StockBatchService] Starting processSaleByStockId with stockId:', stockId, 'unitId:', unitId, 'quantity:', quantityToReduce);

        return await db.transaction(async (tx) => {
            // Get the specific stock entry
            const [stockEntry] = await tx.select().from(stockTable).where(eq(stockTable.id, stockId));

            if (!stockEntry) {
                throw new Error(`Stock entry not found with ID: ${stockId}`);
            }

            if (!stockEntry.stockBatchId) {
                throw new Error(`Stock entry ${stockId} is not linked to any batch`);
            }

            console.log('✅ [StockBatchService] Stock entry found:', stockEntry);

            // Get product information to find main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, stockEntry.productId));

            if (!product || !product.mainUnitId) {
                throw new Error(`Product or main unit not found for product ID: ${stockEntry.productId}`);
            }

            console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

            // Get all unit conversions for this product
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, stockEntry.productId));

            const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
            const saleUnitConversion = unitConversions.find(uc => uc.unitId === unitId);

            if (!mainUnitConversion || !saleUnitConversion) {
                throw new Error(`Unit conversion not found for product ${stockEntry.productId} or sale unit ${unitId}`);
            }

            console.log('📊 [StockBatchService] Unit conversions found - Main:', mainUnitConversion.conversionFactor, 'Sale unit:', saleUnitConversion.conversionFactor);

            // Convert sale unit quantity to main unit quantity
            const mainUnitQuantityToReduce = Number(
                (quantityToReduce / saleUnitConversion.conversionFactor).toFixed(3)
            );

            console.log('🧮 [StockBatchService] Calculated main unit quantity to reduce:', mainUnitQuantityToReduce);

            // Check if sufficient quantity is available in the sale unit
            const currentUnitConversion = unitConversions.find(uc => uc.unitId === stockEntry.unitId);
            if (!currentUnitConversion) {
                throw new Error(`Unit conversion not found for stock unit ${stockEntry.unitId}`);
            }

            const quantityInSaleUnit = Number(
                (stockEntry.quantity * saleUnitConversion.conversionFactor).toFixed(3)
            );

            if (quantityInSaleUnit < quantityToReduce) {
                throw new Error(`Insufficient stock. Available: ${quantityInSaleUnit} ${unitId}, Required: ${quantityToReduce} ${unitId}`);
            }

            // Update all units in the batch proportionally based on main unit reduction
            const allUpdates = await this.updateAllUnitsInBatch(
                tx,
                stockEntry.stockBatchId,
                stockEntry.productId,
                quantityToReduce / saleUnitConversion.conversionFactor
            );

            console.log('✅ [StockBatchService] All units updated successfully');

            return {
                saleUnitId: unitId,
                saleQuantity: quantityToReduce,
                mainUnitReduced: mainUnitQuantityToReduce,
                allUpdates: allUpdates
            };
        });
    }

    /**
     * Process sale by batch ID with any unit quantity input (FIFO approach)
     * Now accepts quantity in any unit and automatically reduces all units proportionally
     */
    static async processSaleByBatchAndUnit(batchId: string, unitId: string, quantityToReduce: number) {
        console.log('🚀 [StockBatchService] Starting processSaleByBatchAndUnit with batchId:', batchId, 'unitId:', unitId, 'quantity:', quantityToReduce);

        return await db.transaction(async (tx) => {
            // Get batch information to find product
            const [batch] = await tx.select().from(stockBatchTable).where(eq(stockBatchTable.id, batchId));

            if (!batch) {
                throw new Error(`Batch not found with ID: ${batchId}`);
            }

            console.log('✅ [StockBatchService] Batch found:', batch);

            // Get product information to find main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, batch.productId));

            if (!product || !product.mainUnitId) {
                throw new Error(`Product or main unit not found for product ID: ${batch.productId}`);
            }

            console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

            // Get all unit conversions for this product
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, batch.productId));

            const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
            const saleUnitConversion = unitConversions.find(uc => uc.unitId === unitId);

            if (!mainUnitConversion || !saleUnitConversion) {
                throw new Error(`Unit conversion not found for product ${batch.productId} or sale unit ${unitId}`);
            }

            // Convert sale unit quantity to main unit quantity
            const mainUnitQuantityToReduce = Number(
                (quantityToReduce / saleUnitConversion.conversionFactor).toFixed(3)
            );

            console.log('🧮 [StockBatchService] Calculated main unit quantity to reduce:', mainUnitQuantityToReduce);

            // Get stock entries for this batch and main unit, ordered by creation date (FIFO)
            const stockEntries = await tx.select()
                .from(stockTable)
                .where(and(
                    eq(stockTable.stockBatchId, batchId),
                    eq(stockTable.unitId, product.mainUnitId)
                ))
                .orderBy(asc(stockTable.createdAt));

            if (stockEntries.length === 0) {
                throw new Error(`No stock found for batch ${batchId} with main unit ${product.mainUnitId}`);
            }

            console.log('📦 [StockBatchService] Found', stockEntries.length, 'stock entries for main unit');

            // Check if we have enough total stock in the sale unit
            const totalAvailableInMainUnit = stockEntries.reduce((sum, stock) => sum + stock.quantity, 0);
            const totalAvailableInSaleUnit = Number(
                (totalAvailableInMainUnit * saleUnitConversion.conversionFactor).toFixed(3)
            );

            if (totalAvailableInSaleUnit < quantityToReduce) {
                throw new Error(`Insufficient stock. Available: ${totalAvailableInSaleUnit} ${unitId}, Required: ${quantityToReduce} ${unitId}`);
            }

            let remainingToReduce = mainUnitQuantityToReduce;
            const results = [];

            for (const stockEntry of stockEntries) {
                if (remainingToReduce <= 0) break;

                const reduceFromThis = Math.min(stockEntry.quantity, remainingToReduce);

                console.log('🔄 [StockBatchService] Processing stock entry:', stockEntry.id, 'reducing:', reduceFromThis);

                // Update all units in the batch proportionally based on this reduction
                const allUpdates = await this.updateAllUnitsInBatch(
                    tx,
                    batchId,
                    batch.productId,
                    reduceFromThis
                );

                results.push({
                    stockId: stockEntry.id,
                    mainUnitReduced: reduceFromThis,
                    allUpdates: allUpdates
                });

                remainingToReduce -= reduceFromThis;
            }

            console.log('✅ [StockBatchService] FIFO sale processing completed');

            return {
                saleUnitId: unitId,
                saleQuantity: quantityToReduce,
                mainUnitReduced: mainUnitQuantityToReduce,
                processedStocks: results
            };
        });
    }

    /**
     * Update all units in the same batch proportionally based on main unit reduction
     */
    private static async updateAllUnitsInBatch(
        tx: any,
        batchId: string,
        productId: string,
        mainUnitReductionQuantity: number
    ) {
        console.log('🔄 [StockBatchService] Starting updateAllUnitsInBatch for batch:', batchId, 'mainUnitReduction:', mainUnitReductionQuantity);

        // Get product information to find main unit
        const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));

        if (!product || !product.mainUnitId) {
            throw new Error(`Product or main unit not found for product ID: ${productId}`);
        }

        // Get all unit conversions for this product
        const unitConversions = await tx.select().from(unitConversionTable)
            .where(eq(unitConversionTable.productId, productId));

        const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);

        if (!mainUnitConversion) {
            throw new Error(`Main unit conversion not found for product ${productId}`);
        }

        console.log('📊 [StockBatchService] Found', unitConversions.length, 'unit conversions');

        // Get all stock entries in this batch for this product
        const allStocks = await tx.select()
            .from(stockTable)
            .where(and(
                eq(stockTable.stockBatchId, batchId),
                eq(stockTable.productId, productId)
            ));

        const results = [];

        for (const stock of allStocks) {
            const unitConversion = unitConversions.find(uc => uc.unitId === stock.unitId);

            if (!unitConversion) {
                console.warn('⚠️ [StockBatchService] Unit conversion not found for unit:', stock.unitId);
                continue;
            }

            // Calculate reduction for this unit based on conversion factor
            // Formula: mainUnitReduction * (thisUnitConversionFactor / mainUnitConversionFactor)
            const reductionForThisUnit = Number(
                (mainUnitReductionQuantity * (unitConversion.conversionFactor / mainUnitConversion.conversionFactor)).toFixed(3)
            );

            console.log('🧮 [StockBatchService] Calculated reduction for unit', stock.unitId, ':', reductionForThisUnit);

            const newQuantity = Number((stock.quantity - reductionForThisUnit).toFixed(3));

            if (newQuantity < 0) {
                throw new Error(
                    `Insufficient stock in unit ${stock.unitId}. Available: ${stock.quantity}, Required: ${reductionForThisUnit}`
                );
            }

            // Update the stock
            const [updatedStock] = await tx.update(stockTable)
                .set({
                    quantity: newQuantity,
                    updatedAt: getCurrentDate()
                })
                .where(eq(stockTable.id, stock.id))
                .returning();

            console.log('✅ [StockBatchService] Updated stock for unit', stock.unitId, 'from', stock.quantity, 'to', newQuantity);

            results.push({
                stock: updatedStock,
                unitId: stock.unitId,
                previousQuantity: stock.quantity,
                reducedQuantity: reductionForThisUnit,
                newQuantity: newQuantity
            });
        }

        console.log('🎉 [StockBatchService] All units updated successfully. Total units:', results.length);

        return results;
    }

    /**
     * Get stock by ID with batch information
     */
    static async getStockById(stockId: string) {
        const [stock] = await db.select({
            stock: stockTable,
            batch: stockBatchTable
        })
            .from(stockTable)
            .leftJoin(stockBatchTable, eq(stockTable.stockBatchId, stockBatchTable.id))
            .where(eq(stockTable.id, stockId));

        return stock;
    }

    /**
     * Get all stocks in a batch
     */
    static async getStocksByBatch(batchId: string) {
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
            product: {
                id: productTable.id,
                name: productTable.name,
                sku: productTable.sku
            },
            maintains: {
                id: maintainsTable.id,
                name: maintainsTable.name,
                type: maintainsTable.type
            },
            unit: {
                id: unitTable.id,
                name: unitTable.name
            }
        })
            .from(stockTable)
            .innerJoin(productTable, eq(stockTable.productId, productTable.id))
            .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
            .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
            .where(eq(stockTable.stockBatchId, batchId))
            .orderBy(asc(stockTable.createdAt));
    }

    /**
     * Get batch information with all its stocks
     */
    static async getBatchWithStocks(batchId: string) {
        const [batch] = await db.select({
            id: stockBatchTable.id,
            createdAt: stockBatchTable.createdAt,
            updatedAt: stockBatchTable.updatedAt,
            productId: stockBatchTable.productId,
            maintainsId: stockBatchTable.maintainsId,
            batchNumber: stockBatchTable.batchNumber,
            productionDate: stockBatchTable.productionDate,
            createdBy: stockBatchTable.createdBy,
            product: {
                id: productTable.id,
                name: productTable.name,
                sku: productTable.sku
            },
            maintains: {
                id: maintainsTable.id,
                name: maintainsTable.name,
                type: maintainsTable.type
            }
        })
            .from(stockBatchTable)
            .innerJoin(productTable, eq(stockBatchTable.productId, productTable.id))
            .innerJoin(maintainsTable, eq(stockBatchTable.maintainsId, maintainsTable.id))
            .where(eq(stockBatchTable.id, batchId));

        if (!batch) {
            throw new Error(`Batch not found with ID: ${batchId}`);
        }

        const stocks = await this.getStocksByBatch(batchId);

        return {
            batch,
            stocks
        };
    }

    /**
     * Get available stock for a product across all batches (FIFO order)
     */
    static async getAvailableStockForProduct(productId: string, maintainsId: string, unitId?: string) {
        let whereConditions = [
            eq(stockTable.productId, productId),
            eq(stockTable.maintainsId, maintainsId),
            sql`${stockTable.quantity} > 0`
        ];

        if (unitId) {
            whereConditions.push(eq(stockTable.unitId, unitId));
        }

        return await db.select({
            stock: stockTable,
            batch: stockBatchTable
        })
            .from(stockTable)
            .leftJoin(stockBatchTable, eq(stockTable.stockBatchId, stockBatchTable.id))
            .where(and(...whereConditions))
            .orderBy(asc(stockBatchTable.productionDate), asc(stockTable.createdAt));
    }

    /**
     * Get all batches with pagination and filtering
     */
    static async getBatches(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        return await filterWithPaginate(stockBatchTable, {
            pagination,
            filter,
            joins: [
                {
                    table: productTable,
                    alias: 'product',
                    condition: eq(stockBatchTable.productId, productTable.id),
                    type: 'left'
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(stockBatchTable.maintainsId, maintainsTable.id),
                    type: 'left'
                }
            ],
            select: {
                id: stockBatchTable.id,
                createdAt: stockBatchTable.createdAt,
                updatedAt: stockBatchTable.updatedAt,
                createdBy: stockBatchTable.createdBy,
                productId: stockBatchTable.productId,
                maintainsId: stockBatchTable.maintainsId,
                batchNumber: stockBatchTable.batchNumber,
                productionDate: stockBatchTable.productionDate,
                product: sql`json_build_object('id', ${productTable.id}, 'name', ${productTable.name}, 'sku', ${productTable.sku})`,
                maintains: sql`json_build_object('id', ${maintainsTable.id}, 'name', ${maintainsTable.name})`
            },
            orderBy: desc(stockBatchTable.createdAt)
        });
    }

    /**
     * Get batch by ID with detailed information
     */
    static async getBatchById(batchId: string) {
        const [batch] = await db.select({
            id: stockBatchTable.id,
            createdAt: stockBatchTable.createdAt,
            updatedAt: stockBatchTable.updatedAt,
            createdBy: stockBatchTable.createdBy,
            productId: stockBatchTable.productId,
            maintainsId: stockBatchTable.maintainsId,
            batchNumber: stockBatchTable.batchNumber,
            productionDate: stockBatchTable.productionDate,
            product: sql`json_build_object('id', ${productTable.id}, 'name', ${productTable.name}, 'sku', ${productTable.sku})`,
            maintains: sql`json_build_object('id', ${maintainsTable.id}, 'name', ${maintainsTable.name})`
        })
            .from(stockBatchTable)
            .leftJoin(productTable, eq(stockBatchTable.productId, productTable.id))
            .leftJoin(maintainsTable, eq(stockBatchTable.maintainsId, maintainsTable.id))
            .where(eq(stockBatchTable.id, batchId));

        return batch;
    }

    /**
     * Update batch information
     */
    static async updateBatch(batchId: string, updateData: {
        batchNumber?: string;
        productionDate?: Date;
        maintainsId?: string;
        mainUnitQuantity?: number;
    }) {
        console.log('🚀 [StockBatchService] Starting updateBatch with batchId:', batchId, 'updateData:', updateData);

        return await db.transaction(async (tx) => {
            // Check if batch exists
            const existingBatch = await this.getBatchById(batchId);
            if (!existingBatch) {
                throw new Error(`Stock batch with ID ${batchId} not found`);
            }

            console.log('✅ [StockBatchService] Batch found:', existingBatch);

            // If maintainsId is being updated, verify it exists
            if (updateData.maintainsId) {
                const [maintains] = await tx.select().from(maintainsTable)
                    .where(eq(maintainsTable.id, updateData.maintainsId));

                if (!maintains) {
                    throw new Error(`Maintains with ID ${updateData.maintainsId} not found`);
                }
            }

            // Handle mainUnitQuantity update if provided
            if (updateData.mainUnitQuantity !== undefined) {
                console.log('🔄 [StockBatchService] Processing mainUnitQuantity update:', updateData.mainUnitQuantity);

                // Get product information to find main unit
                const [product] = await tx.select().from(productTable)
                    .where(eq(productTable.id, existingBatch.productId));

                if (!product || !product.mainUnitId) {
                    throw new Error(`Product or main unit not found for product ID: ${existingBatch.productId}`);
                }

                console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

                // Get all unit conversions for this product
                const unitConversions = await tx.select().from(unitConversionTable)
                    .where(eq(unitConversionTable.productId, existingBatch.productId));

                if (unitConversions.length === 0) {
                    throw new Error(`No unit conversions found for product ${existingBatch.productId}`);
                }

                console.log('📊 [StockBatchService] Found', unitConversions.length, 'unit conversions');

                // Find the main unit conversion factor
                const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
                if (!mainUnitConversion) {
                    throw new Error(`Main unit conversion not found for product ${existingBatch.productId}`);
                }

                console.log('🎯 [StockBatchService] Main unit conversion factor:', mainUnitConversion.conversionFactor);

                // Get existing stock entries for this batch
                const existingStocks = await tx.select().from(stockTable)
                    .where(eq(stockTable.stockBatchId, batchId));

                console.log('📦 [StockBatchService] Found', existingStocks.length, 'existing stock entries');

                // Update quantities for all units based on new main unit quantity
                for (const stock of existingStocks) {
                    // Find the unit conversion for this stock's unit
                    const unitConversion = unitConversions.find(uc => uc.unitId === stock.unitId);
                    if (!unitConversion) {
                        console.warn('⚠️ [StockBatchService] Unit conversion not found for unit:', stock.unitId, 'skipping...');
                        continue;
                    }

                    // Calculate new quantity for this unit based on conversion factor
                    // Formula: mainUnitQuantity * (thisUnitConversionFactor / mainUnitConversionFactor)
                    const newQuantity = Number(
                        (updateData.mainUnitQuantity * (unitConversion.conversionFactor / mainUnitConversion.conversionFactor)).toFixed(3)
                    );

                    console.log('🧮 [StockBatchService] Updating stock for unit', stock.unitId, ':', {
                        oldQuantity: stock.quantity,
                        newQuantity: newQuantity,
                        conversionFactor: unitConversion.conversionFactor
                    });

                    // Update the stock quantity
                    await tx.update(stockTable)
                        .set({
                            quantity: newQuantity,
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(stockTable.id, stock.id));

                    console.log('✅ [StockBatchService] Updated stock entry:', stock.id);
                }

                console.log('🎉 [StockBatchService] All stock quantities updated successfully');
            }

            // Prepare batch update data (excluding mainUnitQuantity as it's not a batch field)
            const batchUpdateData: any = {};
            if (updateData.batchNumber !== undefined) batchUpdateData.batchNumber = updateData.batchNumber;
            if (updateData.productionDate !== undefined) batchUpdateData.productionDate = updateData.productionDate;
            if (updateData.maintainsId !== undefined) batchUpdateData.maintainsId = updateData.maintainsId;

            // Update the batch if there are batch-specific fields to update
            let updatedBatch = existingBatch;
            if (Object.keys(batchUpdateData).length > 0) {
                console.log('📝 [StockBatchService] Updating batch with data:', batchUpdateData);

                const [updated] = await tx.update(stockBatchTable)
                    .set({
                        ...batchUpdateData,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockBatchTable.id, batchId))
                    .returning();

                // Merge the updated batch data with the existing batch's product and maintains info
                updatedBatch = {
                    ...updated,
                    product: existingBatch.product,
                    maintains: existingBatch.maintains
                };
                console.log('✅ [StockBatchService] Batch updated successfully');
            }

            console.log('🎉 [StockBatchService] updateBatch completed successfully');
            return updatedBatch;
        });
    }

    /**
     * Update individual stock with main unit input and manual unit prices
     * Now accepts main unit quantity and manual prices for each unit
     */
    static async updateStock(stockId: string, updateData: {
        mainUnitQuantity?: number;
        unitPrices?: Array<{ unitId: string; pricePerQuantity: number }>;
    }) {
        console.log('🚀 [StockBatchService] Starting updateStock with stockId:', stockId, 'updateData:', updateData);

        return await db.transaction(async (tx) => {
            // Check if stock exists
            const [existingStock] = await tx.select().from(stockTable)
                .where(eq(stockTable.id, stockId));

            if (!existingStock) {
                throw new Error(`Stock with ID ${stockId} not found`);
            }

            console.log('✅ [StockBatchService] Stock found:', existingStock);

            // Get product information to find main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, existingStock.productId));

            if (!product || !product.mainUnitId) {
                throw new Error(`Product or main unit not found for product ID: ${existingStock.productId}`);
            }

            console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

            // Get all unit conversions for this product
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, existingStock.productId));

            const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
            const currentUnitConversion = unitConversions.find(uc => uc.unitId === existingStock.unitId);

            if (!mainUnitConversion || !currentUnitConversion) {
                throw new Error(`Unit conversion not found for product ${existingStock.productId}`);
            }

            console.log('📊 [StockBatchService] Unit conversions found');

            let updatedStock = existingStock;

            // Handle quantity update
            if (updateData.mainUnitQuantity !== undefined) {
                // Validate quantity is not negative
                if (updateData.mainUnitQuantity < 0) {
                    throw new Error("Main unit quantity cannot be negative");
                }

                console.log('🔄 [StockBatchService] Updating quantities for all units in batch');

                // Update all units in the batch based on new main unit quantity
                await this.updateAllUnitsQuantityInBatch(
                    tx,
                    existingStock.stockBatchId!,
                    existingStock.productId,
                    updateData.mainUnitQuantity
                );

                // Get the updated stock
                [updatedStock] = await tx.select().from(stockTable)
                    .where(eq(stockTable.id, stockId));
            }

            // Handle manual unit prices update
            if (updateData.unitPrices !== undefined) {
                console.log('💰 [StockBatchService] Updating manual unit prices for batch');

                // Validate all unit prices are for valid units
                for (const unitPrice of updateData.unitPrices) {
                    const unitExists = unitConversions.find(uc => uc.unitId === unitPrice.unitId);
                    if (!unitExists) {
                        throw new Error(`Unit ID ${unitPrice.unitId} not found for product ${existingStock.productId}`);
                    }
                    if (unitPrice.pricePerQuantity <= 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} must be positive`);
                    }
                }

                // Update prices for all units in the batch
                await this.updateAllUnitsManualPriceInBatch(
                    tx,
                    existingStock.stockBatchId!,
                    existingStock.productId,
                    updateData.unitPrices
                );

                // Get the updated stock
                [updatedStock] = await tx.select().from(stockTable)
                    .where(eq(stockTable.id, stockId));
            }

            console.log('✅ [StockBatchService] Stock update completed');

            return updatedStock;
        });
    }

    /**
     * Update multiple stocks in a batch with main unit input and manual unit prices
     * Now accepts main unit quantity and manual prices for each unit
     */
    static async updateBatchStocks(batchId: string, updateData: {
        mainUnitQuantity?: number;
        unitPrices?: Array<{ unitId: string; pricePerQuantity: number }>;
    }) {
        console.log('🚀 [StockBatchService] Starting updateBatchStocks with batchId:', batchId, 'updateData:', updateData);

        return await db.transaction(async (tx) => {
            // Verify batch exists
            const [batch] = await tx.select().from(stockBatchTable)
                .where(eq(stockBatchTable.id, batchId));

            if (!batch) {
                throw new Error(`Stock batch with ID ${batchId} not found`);
            }

            console.log('✅ [StockBatchService] Batch found:', batch);

            // Get product information to find main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, batch.productId));

            if (!product || !product.mainUnitId) {
                throw new Error(`Product or main unit not found for product ID: ${batch.productId}`);
            }

            console.log('✅ [StockBatchService] Product found with main unit:', product.mainUnitId);

            // Get all unit conversions for validation
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, batch.productId));

            // Handle quantity update
            if (updateData.mainUnitQuantity !== undefined) {
                // Validate quantity is not negative
                if (updateData.mainUnitQuantity < 0) {
                    throw new Error("Main unit quantity cannot be negative");
                }

                console.log('🔄 [StockBatchService] Updating quantities for all units in batch');

                // Update all units in the batch based on new main unit quantity
                await this.updateAllUnitsQuantityInBatch(
                    tx,
                    batchId,
                    batch.productId,
                    updateData.mainUnitQuantity
                );
            }

            // Handle manual unit prices update
            if (updateData.unitPrices !== undefined) {
                console.log('💰 [StockBatchService] Updating manual unit prices for batch');

                // Validate all unit prices are for valid units
                for (const unitPrice of updateData.unitPrices) {
                    const unitExists = unitConversions.find(uc => uc.unitId === unitPrice.unitId);
                    if (!unitExists) {
                        throw new Error(`Unit ID ${unitPrice.unitId} not found for product ${batch.productId}`);
                    }
                    if (unitPrice.pricePerQuantity <= 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} must be positive`);
                    }
                }

                // Update prices for all units in the batch
                await this.updateAllUnitsManualPriceInBatch(
                    tx,
                    batchId,
                    batch.productId,
                    updateData.unitPrices
                );
            }

            // Get all updated stocks in the batch
            const updatedStocks = await tx.select().from(stockTable)
                .where(eq(stockTable.stockBatchId, batchId))
                .orderBy(asc(stockTable.createdAt));

        console.log('✅ [StockBatchService] Batch stocks update completed');

        return updatedStocks;
    });
    }

    /**
     * Update the latest batch by product and maintains.
     * - Adds quantities based on provided main unit quantity (does not replace)
     * - Updates manual prices like updateBatchStocks
     * - If provided unit prices do not match existing latest batch prices exactly, creates a new batch
     */
    static async updateLatestBatchByProductAndMaintains(
        productId: string,
        maintainsId: string,
        updateData: {
            mainUnitQuantity?: number;
            unitPrices?: Array<{ unitId: string; pricePerQuantity: number }>;
            productionDate?: Date;
        }
    ) {
        console.log('🚀 [StockBatchService] Starting updateLatestBatchByProductAndMaintains with', { productId, maintainsId, updateData });

        return await db.transaction(async (tx) => {
            // Find latest batch for product-maintains by createdAt desc
            const latestBatches = await tx.select().from(stockBatchTable)
                .where(and(eq(stockBatchTable.productId, productId), eq(stockBatchTable.maintainsId, maintainsId)))
                .orderBy(desc(stockBatchTable.createdAt));

            const latestBatch = latestBatches[0];

            // Get product information to validate main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));
            if (!product) {
                throw new Error(`Product not found with ID: ${productId}`);
            }
            if (!product.mainUnitId) {
                throw new Error(`Product ${productId} does not have a main unit defined`);
            }

            // Get unit conversions for this product
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, productId));
            if (unitConversions.length === 0) {
                throw new Error(`No unit conversions found for product ${productId}`);
            }

            // If no latest batch exists, create a new batch
            if (!latestBatch) {
                if (updateData.mainUnitQuantity === undefined || updateData.unitPrices === undefined) {
                    throw new Error('Creating a new batch requires mainUnitQuantity and unitPrices');
                }
                console.log('ℹ️ [StockBatchService] No existing batch found. Creating a new batch.');
                return await this.addNewStockBatch({
                    productId,
                    maintainsId,
                    batchNumber: randomUUID(),
                    productionDate: updateData.productionDate || getCurrentDate(),
                    mainUnitQuantity: updateData.mainUnitQuantity,
                    unitPrices: updateData.unitPrices
                });
            }

            console.log('✅ [StockBatchService] Latest batch found:', latestBatch);

            // If unitPrices provided, ensure they match existing latest batch stock prices exactly
            if (updateData.unitPrices !== undefined) {
                const existingStocks = await tx.select().from(stockTable)
                    .where(eq(stockTable.stockBatchId, latestBatch.id));

                // Build a map for quick comparison
                const existingPriceMap = new Map<string, number>();
                for (const s of existingStocks) {
                    existingPriceMap.set(s.unitId, Number(s.pricePerQuantity));
                }

                let pricesMatch = true;
                // All units in batch must have a provided price and match exactly
                if (existingStocks.length !== updateData.unitPrices.length) {
                    pricesMatch = false;
                } else {
                    for (const up of updateData.unitPrices) {
                        const existingPrice = existingPriceMap.get(up.unitId);
                        if (existingPrice === undefined || Number(existingPrice) !== Number(up.pricePerQuantity)) {
                            pricesMatch = false;
                            break;
                        }
                    }
                }

                if (!pricesMatch) {
                    // Create a new batch with provided prices and quantities
                    if (updateData.mainUnitQuantity === undefined) {
                        throw new Error('Creating a new batch due to price mismatch requires mainUnitQuantity');
                    }
                    console.log('ℹ️ [StockBatchService] Price mismatch detected. Creating a new batch.');
                    return await this.addNewStockBatch({
                        productId,
                        maintainsId,
                        batchNumber: randomUUID(),
                        productionDate: updateData.productionDate || getCurrentDate(),
                        mainUnitQuantity: updateData.mainUnitQuantity,
                        unitPrices: updateData.unitPrices
                    });
                }
            }

            // Add quantities to all units based on provided main unit quantity (if any)
            if (updateData.mainUnitQuantity !== undefined) {
                await this.addAllUnitsQuantityInBatch(
                    tx,
                    latestBatch.id,
                    productId,
                    updateData.mainUnitQuantity
                );
            }

            // Update manual prices for units (if provided), following same validation logic as updateBatchStocks
            if (updateData.unitPrices !== undefined) {
                // Validate all unit prices are for valid units
                for (const unitPrice of updateData.unitPrices) {
                    const unitExists = unitConversions.find(uc => uc.unitId === unitPrice.unitId);
                    if (!unitExists) {
                        throw new Error(`Unit ID ${unitPrice.unitId} not found for product ${productId}`);
                    }
                    if (unitPrice.pricePerQuantity <= 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} must be positive`);
                    }
                }

                await this.updateAllUnitsManualPriceInBatch(
                    tx,
                    latestBatch.id,
                    productId,
                    updateData.unitPrices
                );
            }

            // Return all updated stocks in the latest batch
            const updatedStocks = await tx.select().from(stockTable)
                .where(eq(stockTable.stockBatchId, latestBatch.id))
                .orderBy(asc(stockTable.createdAt));

            console.log('🎉 [StockBatchService] Latest batch update completed.');
            return updatedStocks;
        });
    }

    /**
     * Helper method to update quantities for all units in a batch based on main unit quantity
     */
    private static async updateAllUnitsQuantityInBatch(
        tx: any,
        batchId: string,
        productId: string,
        mainUnitQuantity: number
    ) {
        console.log('🔄 [StockBatchService] Starting updateAllUnitsQuantityInBatch for batch:', batchId);

        // Get all unit conversions for the product
        const unitConversions = await tx.select().from(unitConversionTable)
            .where(eq(unitConversionTable.productId, productId));

        console.log('📊 [StockBatchService] Found unit conversions:', unitConversions.length);

        // Get all stocks in the batch
        const stocks = await tx.select().from(stockTable)
            .where(eq(stockTable.stockBatchId, batchId));

        // Update each stock based on its unit conversion
        for (const stock of stocks) {
            const unitConversion = unitConversions.find(uc => uc.unitId === stock.unitId);

            if (unitConversion) {
                const quantityForThisUnit = mainUnitQuantity * unitConversion.conversionFactor;

                console.log(`📦 [StockBatchService] Updating stock ${stock.id} to quantity: ${quantityForThisUnit}`);

                await tx.update(stockTable)
                    .set({
                        quantity: quantityForThisUnit,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockTable.id, stock.id));
            }
        }

        console.log('✅ [StockBatchService] All unit quantities updated in batch');
    }

    /**
     * Helper method to add quantities to all units in a batch based on main unit quantity
     */
    private static async addAllUnitsQuantityInBatch(
        tx: any,
        batchId: string,
        productId: string,
        addMainUnitQuantity: number
    ) {
        console.log('➕ [StockBatchService] Starting addAllUnitsQuantityInBatch for batch:', batchId);

        // Get all unit conversions for the product
        const unitConversions = await tx.select().from(unitConversionTable)
            .where(eq(unitConversionTable.productId, productId));

        // Find the main unit conversion factor
        const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));
        if (!product || !product.mainUnitId) {
            throw new Error(`Product or main unit not found for product ID: ${productId}`);
        }
        const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
        if (!mainUnitConversion) {
            throw new Error(`Main unit conversion not found for product ${productId}`);
        }

        // Get all stocks in the batch
        const stocks = await tx.select().from(stockTable)
            .where(eq(stockTable.stockBatchId, batchId));

        // Update each stock by adding calculated quantity
        for (const stock of stocks) {
            const unitConversion = unitConversions.find(uc => uc.unitId === stock.unitId);
            if (unitConversion) {
                const additionalQuantity = Number(
                    (addMainUnitQuantity * (unitConversion.conversionFactor / mainUnitConversion.conversionFactor)).toFixed(3)
                );

                const newQuantity = Number((stock.quantity + additionalQuantity).toFixed(3));

                console.log(`📦 [StockBatchService] Adding to stock ${stock.id}: +${additionalQuantity} => ${newQuantity}`);

                await tx.update(stockTable)
                    .set({
                        quantity: newQuantity,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockTable.id, stock.id));
            }
        }

        console.log('✅ [StockBatchService] Quantities added to all units in batch');
    }

    /**
     * Helper method to update prices for all units in a batch with manual unit prices
     */
    private static async updateAllUnitsManualPriceInBatch(
        tx: any,
        batchId: string,
        productId: string,
        unitPrices: Array<{ unitId: string; pricePerQuantity: number }>
    ) {
        console.log('💰 [StockBatchService] Starting updateAllUnitsManualPriceInBatch for batch:', batchId);

        // Get all stocks in the batch
        const stocks = await tx.select().from(stockTable)
            .where(eq(stockTable.stockBatchId, batchId));

        // Update each stock's price based on manual unit prices
        for (const stock of stocks) {
            const unitPrice = unitPrices.find(up => up.unitId === stock.unitId);

            if (unitPrice) {
                console.log(`💵 [StockBatchService] Updating stock ${stock.id} to manual price: ${unitPrice.pricePerQuantity}`);

                await tx.update(stockTable)
                    .set({
                        pricePerQuantity: unitPrice.pricePerQuantity,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(stockTable.id, stock.id));
            }
        }

        console.log('✅ [StockBatchService] All unit prices updated in batch with manual prices');
    }

    /**
     * Process multiple batch sales in a single transaction
     * Each sale item contains: stockBatchId, unitId, quantity
     */
    static async processMultiBatchSale(saleItems: Array<{ stockBatchId: string, unitId: string, quantity: number }>) {

        await db.transaction(async (tx) => {
            // Group sale items by batch to accumulate reductions per batch
            const batchReductions = new Map<string, {
                totalMainUnitReduction: number,
                saleItems: Array<{ unitId: string, quantity: number, mainUnitReduced: number }>,
                batch: any,
                productId: string
            }>();

            // First pass: calculate total reductions per batch
            for (const saleItem of saleItems) {
                const { stockBatchId, unitId, quantity } = saleItem;

                console.log('🔄 [StockBatchService] Processing sale item:', { stockBatchId, unitId, quantity });

                // Get batch information to find product
                const [batch] = await tx.select().from(stockBatchTable).where(eq(stockBatchTable.id, stockBatchId));

                if (!batch) {
                    throw new Error(`Batch not found with ID: ${stockBatchId}`);
                }

                // Get product information to find main unit
                const [product] = await tx.select().from(productTable).where(eq(productTable.id, batch.productId));

                if (!product || !product.mainUnitId) {
                    throw new Error(`Product or main unit not found for product ID: ${batch.productId}`);
                }

                // Get all unit conversions for this product
                const unitConversions = await tx.select().from(unitConversionTable)
                    .where(eq(unitConversionTable.productId, batch.productId));

                const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
                const saleUnitConversion = unitConversions.find(uc => uc.unitId === unitId);

                if (!mainUnitConversion || !saleUnitConversion) {
                    throw new Error(`Unit conversion not found for product ${batch.productId} or sale unit ${unitId}`);
                }

                // Convert sale unit quantity to main unit quantity
                const mainUnitQuantityToReduce = Number(
                    (quantity / saleUnitConversion.conversionFactor).toFixed(3)
                );

                // Accumulate reductions for this batch
                if (!batchReductions.has(stockBatchId)) {
                    batchReductions.set(stockBatchId, {
                        totalMainUnitReduction: 0,
                        saleItems: [],
                        batch: batch,
                        productId: batch.productId
                    });
                }

                const batchData = batchReductions.get(stockBatchId)!;
                batchData.totalMainUnitReduction += mainUnitQuantityToReduce;
                batchData.saleItems.push({
                    unitId,
                    quantity,
                    mainUnitReduced: mainUnitQuantityToReduce
                });
            }

            // Second pass: validate stock availability and apply reductions
            const results = [];

            for (const [stockBatchId, batchData] of batchReductions) {
                console.log('🔄 [StockBatchService] Processing batch:', stockBatchId, 'total reduction:', batchData.totalMainUnitReduction);

                // Get product information to find main unit
                const [product] = await tx.select().from(productTable).where(eq(productTable.id, batchData.productId));

                // Get stock entries for this batch and main unit, ordered by creation date (FIFO)
                const stockEntries = await tx.select()
                    .from(stockTable)
                    .where(and(
                        eq(stockTable.stockBatchId, stockBatchId),
                        eq(stockTable.unitId, product!.mainUnitId)
                    ))
                    .orderBy(asc(stockTable.createdAt));

                if (stockEntries.length === 0) {
                    throw new Error(`No stock found for batch ${stockBatchId} with main unit ${product!.mainUnitId}`);
                }

                // Check if we have enough total stock
                const totalAvailableInMainUnit = stockEntries.reduce((sum, stock) => sum + stock.quantity, 0);

                if (totalAvailableInMainUnit < batchData.totalMainUnitReduction) {
                    throw new Error(`Insufficient stock in batch ${stockBatchId}. Available: ${totalAvailableInMainUnit} main units, Required: ${batchData.totalMainUnitReduction} main units`);
                }

                // Apply the total reduction to all units in the batch (only once per batch)
                const allUpdates = await this.updateAllUnitsInBatch(
                    tx,
                    stockBatchId,
                    batchData.productId,
                    batchData.totalMainUnitReduction
                );

                // Create result for each sale item in this batch
                for (const saleItemData of batchData.saleItems) {
                    results.push({
                        stockBatchId,
                        saleUnitId: saleItemData.unitId,
                        saleQuantity: saleItemData.quantity,
                        mainUnitReduced: saleItemData.mainUnitReduced,
                        processedStocks: [{
                            stockId: stockEntries[0].id, // Reference first stock entry
                            mainUnitReduced: saleItemData.mainUnitReduced,
                            allUpdates: allUpdates
                        }]
                    });
                }
            }

            console.log('✅ [StockBatchService] Multi-batch sale processing completed');

            return {
                totalItems: saleItems.length,
                results
            };
        });
    }

    /**
     * Clean up empty stock batches for a product in a specific outlet
     * Removes stock batches that have all stock quantities at 0, but only if there are other batches with stock > 0
     */
    static async cleanupEmptyStockBatches(productId: string, maintainsId: string) {
        console.log('🧹 [StockBatchService] Starting cleanup for product:', productId, 'in outlet:', maintainsId);

        return await db.transaction(async (tx) => {
            // Get all stock batches for this product in this outlet
            const stockBatches = await tx.select({
                batchId: stockBatchTable.id,
                batchNumber: stockBatchTable.batchNumber,
                productionDate: stockBatchTable.productionDate
            })
            .from(stockBatchTable)
            .where(and(
                eq(stockBatchTable.productId, productId),
                eq(stockBatchTable.maintainsId, maintainsId)
            ));

            if (stockBatches.length <= 1) {
                console.log('📦 [StockBatchService] Only one or no batches found, skipping cleanup');
                return { cleanedBatches: [], message: 'No cleanup needed - insufficient batches' };
            }

            console.log('📦 [StockBatchService] Found', stockBatches.length, 'batches to analyze');

            // Check stock quantities for each batch
            const batchStockInfo = [];
            
            for (const batch of stockBatches) {
                const stocks = await tx.select({
                    id: stockTable.id,
                    quantity: stockTable.quantity,
                    unitId: stockTable.unitId
                })
                .from(stockTable)
                .where(and(
                    eq(stockTable.stockBatchId, batch.batchId),
                    eq(stockTable.productId, productId),
                    eq(stockTable.maintainsId, maintainsId)
                ));

                const totalQuantity = stocks.reduce((sum, stock) => sum + stock.quantity, 0);
                const hasStock = totalQuantity > 0;

                batchStockInfo.push({
                    batchId: batch.batchId,
                    batchNumber: batch.batchNumber,
                    totalQuantity,
                    hasStock,
                    stockCount: stocks.length
                });

                console.log('📊 [StockBatchService] Batch', batch.batchNumber, '- Total quantity:', totalQuantity, 'Has stock:', hasStock);
            }

            // Find batches with stock > 0 and batches with stock = 0
            const batchesWithStock = batchStockInfo.filter(b => b.hasStock);
            const emptyBatches = batchStockInfo.filter(b => !b.hasStock);

            console.log('📈 [StockBatchService] Batches with stock:', batchesWithStock.length);
            console.log('📉 [StockBatchService] Empty batches:', emptyBatches.length);

            // Only remove empty batches if there are other batches with stock
            if (batchesWithStock.length === 0) {
                console.log('⚠️ [StockBatchService] No batches with stock found, keeping all empty batches');
                return { 
                    cleanedBatches: [], 
                    message: 'No cleanup performed - no batches with stock available' 
                };
            }

            if (emptyBatches.length === 0) {
                console.log('✅ [StockBatchService] No empty batches found, no cleanup needed');
                return { 
                    cleanedBatches: [], 
                    message: 'No cleanup needed - no empty batches found' 
                };
            }

            // Remove empty batches (both stock entries and batch records)
            const cleanedBatches = [];

            for (const emptyBatch of emptyBatches) {
                console.log('🗑️ [StockBatchService] Removing empty batch:', emptyBatch.batchNumber);

                // First, delete all stock entries for this batch
                const deletedStocks = await tx.delete(stockTable)
                    .where(and(
                        eq(stockTable.stockBatchId, emptyBatch.batchId),
                        eq(stockTable.productId, productId),
                        eq(stockTable.maintainsId, maintainsId)
                    ))
                    .returning();

                console.log('🗑️ [StockBatchService] Deleted', deletedStocks.length, 'stock entries for batch:', emptyBatch.batchNumber);

                // Then, delete the batch record itself
                const [deletedBatch] = await tx.delete(stockBatchTable)
                    .where(eq(stockBatchTable.id, emptyBatch.batchId))
                    .returning();

                cleanedBatches.push({
                    batchId: emptyBatch.batchId,
                    batchNumber: emptyBatch.batchNumber,
                    deletedStockEntries: deletedStocks.length,
                    deletedBatch: deletedBatch
                });

                console.log('✅ [StockBatchService] Successfully removed batch:', emptyBatch.batchNumber);
            }

            console.log('🎉 [StockBatchService] Cleanup completed. Removed', cleanedBatches.length, 'empty batches');

            return {
                cleanedBatches,
                message: `Successfully cleaned up ${cleanedBatches.length} empty batches`,
                remainingBatchesWithStock: batchesWithStock.length
            };
        });
    }

    /**
     * Clean up empty stock batches for multiple products after a sale
     * This method should be called after completing a sale to clean up any empty batches
     */
    static async cleanupEmptyStockBatchesAfterSale(saleItems: Array<{ productId: string, maintainsId: string }>) {
        console.log('🧹 [StockBatchService] Starting post-sale cleanup for', saleItems.length, 'products');

        const cleanupResults = [];

        // Get unique product-outlet combinations
        const uniqueProductOutlets = Array.from(
            new Map(saleItems.map(item => [`${item.productId}-${item.maintainsId}`, item])).values()
        );

        console.log('🔄 [StockBatchService] Processing', uniqueProductOutlets.length, 'unique product-outlet combinations');

        for (const item of uniqueProductOutlets) {
            try {
                const result = await this.cleanupEmptyStockBatches(item.productId, item.maintainsId);
                cleanupResults.push({
                    productId: item.productId,
                    maintainsId: item.maintainsId,
                    success: true,
                    result
                });
            } catch (error) {
                console.error('❌ [StockBatchService] Cleanup failed for product:', item.productId, 'Error:', error);
                cleanupResults.push({
                    productId: item.productId,
                    maintainsId: item.maintainsId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        const successfulCleanups = cleanupResults.filter(r => r.success);
        const failedCleanups = cleanupResults.filter(r => !r.success);

        console.log('✅ [StockBatchService] Post-sale cleanup completed:', successfulCleanups.length, 'successful,', failedCleanups.length, 'failed');

        return {
            totalProcessed: uniqueProductOutlets.length,
            successful: successfulCleanups.length,
            failed: failedCleanups.length,
            results: cleanupResults
        };
    }
}