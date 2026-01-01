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
    }, txArg?: any) {
        console.log('🚀 [StockBatchService] Starting addNewStockBatch with data:', JSON.stringify(batchData, null, 2));

        const runAdd = async (tx: any) => {
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

            // Clean up empty stock batches using centralized helper before creating new batch
            try {
                await StockBatchService.cleanupEmptyStockBatches(batchData.productId, batchData.maintainsId, tx);
            } catch (cleanupError) {
                console.error('❌ [StockBatchService] Error during empty batch cleanup:', cleanupError);
                // Do not block batch creation due to cleanup; proceed
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
        };

        if (txArg) {
            return await runAdd(txArg);
        }

        return await db.transaction(runAdd);
    }

    /**
     * Process stock reduction by product and maintains ID (FIFO logic)
     * Finds latest batches and reduces quantity, cascading to older batches if needed
     */
    static async reduceProductStock(productId: string, maintainsId: string, quantityToReduce: number, unitId: string) {
        console.log('🚀 [StockBatchService] Starting reduceProductStock:', { productId, maintainsId, quantityToReduce, unitId });

        return await db.transaction(async (tx) => {
            // 1. Get product info for main unit
            const [product] = await tx.select().from(productTable).where(eq(productTable.id, productId));
            if (!product || !product.mainUnitId) {
                throw new Error(`Product or main unit not found for product ID: ${productId}`);
            }

            // 2. Get unit conversions
            const unitConversions = await tx.select().from(unitConversionTable)
                .where(eq(unitConversionTable.productId, productId));

            const mainUnitConversion = unitConversions.find(uc => uc.unitId === product.mainUnitId);
            const saleUnitConversion = unitConversions.find(uc => uc.unitId === unitId);

            if (!mainUnitConversion || !saleUnitConversion) {
                throw new Error(`Unit conversion not found for product ${productId}`);
            }

            // 3. Fetch all stock batches for this product/maintains, ordered by creation (newest first)
            // We join with stockTable to get quantity in main unit
            // Actually simpler: get batches, then get their main unit stock
            const batches = await tx
                .select({
                    id: stockBatchTable.id,
                    createdAt: stockBatchTable.createdAt
                })
                .from(stockBatchTable)
                .where(and(
                    eq(stockBatchTable.productId, productId),
                    eq(stockBatchTable.maintainsId, maintainsId),
                    eq(stockBatchTable.deleted, false)
                ))
                .orderBy(desc(stockBatchTable.createdAt));

            if (batches.length === 0) {
                throw new Error(`No active stock batches found for product ${product.name}`);
            }

            // 4. Calculate total available quantity in sale unit to check sufficiency
            // We need to fetch stock entries for these batches to know quantities
            const batchIds = batches.map(b => b.id);
            const stockEntries = await tx
                .select()
                .from(stockTable)
                .where(and(
                    inArray(stockTable.stockBatchId, batchIds),
                    eq(stockTable.unitId, product.mainUnitId) // Check main unit stock
                ));

            const totalMainUnitQuantity = stockEntries.reduce((sum, s) => sum + s.quantity, 0);
            const totalSaleUnitQuantity = Number((totalMainUnitQuantity * (saleUnitConversion.conversionFactor / mainUnitConversion.conversionFactor)).toFixed(3));

            console.log(`📊 Stock Check: Required ${quantityToReduce} ${unitId}, Available ${totalSaleUnitQuantity} ${unitId} (in ${totalMainUnitQuantity} main units)`);

            if (totalSaleUnitQuantity < quantityToReduce) {
                throw new Error(`Insufficient stock for product "${product.name}". Available: ${totalSaleUnitQuantity} ${unitId}, Required: ${quantityToReduce} ${unitId}`);
            }

            // 5. Convert required quantity to main unit
            const requiredMainUnitQuantity = Number((quantityToReduce * (mainUnitConversion.conversionFactor / saleUnitConversion.conversionFactor)).toFixed(3));
            let remainingMainUnitToReduce = requiredMainUnitQuantity;
            
            const results = [];

            // 6. Iterate batches from newest to oldest (matches user request "newest first")
            // Note: User said "creation_timestamp DESC (newest first)"
            // "Let latest_batch be the first record... IF latest_batch.quantity >= quantity_to_reduce..."
            // "Iterate through the ordered result set (from newest to oldest)"
            
            // We need to map back stock entries to batches to keep order
            const stockEntriesByBatchId = new Map(stockEntries.map(s => [s.stockBatchId, s]));

            for (const batch of batches) {
                if (remainingMainUnitToReduce <= 0) break;

                const stockEntry = stockEntriesByBatchId.get(batch.id);
                if (!stockEntry) continue; // Should not happen if data integrity is good

                const reduceFromThisBatch = Math.min(stockEntry.quantity, remainingMainUnitToReduce);
                
                if (reduceFromThisBatch > 0) {
                    console.log(`📉 Reducing ${reduceFromThisBatch} (main unit) from batch ${batch.id}`);

                    // Update all units in this batch
                    const allUpdates = await this.updateAllUnitsInBatch(
                        tx,
                        batch.id,
                        productId,
                        reduceFromThisBatch
                    );

                    results.push({
                        batchId: batch.id,
                        mainUnitReduced: reduceFromThisBatch,
                        allUpdates
                    });

                    remainingMainUnitToReduce = Number((remainingMainUnitToReduce - reduceFromThisBatch).toFixed(3));
                }
            }

            console.log('✅ [StockBatchService] Stock reduction completed successfully');
            return {
                productId,
                maintainsId,
                totalReduced: quantityToReduce,
                unitId,
                batchesAffected: results
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

            const [batch] = await tx
                .select({ id: stockBatchTable.id, deleted: stockBatchTable.deleted })
                .from(stockBatchTable)
                .where(eq(stockBatchTable.id, stockEntry.stockBatchId));
            if (!batch || batch.deleted) {
                throw new Error(`Batch is not available for sale: ${stockEntry.stockBatchId}`);
            }

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
                throw new Error(`Insufficient stock for product "${product.name}". Available: ${quantityInSaleUnit} ${unitId}, Required: ${quantityToReduce} ${unitId}`);
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
            const [batch] = await tx
                .select()
                .from(stockBatchTable)
                .where(and(eq(stockBatchTable.id, batchId), eq(stockBatchTable.deleted, false)));

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
                throw new Error(`Insufficient stock for product "${product.name}". Available: ${totalAvailableInSaleUnit} ${unitId}, Required: ${quantityToReduce} ${unitId}`);
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
                    `Insufficient stock for product "${product.name}" in unit ${stock.unitId}. Available: ${stock.quantity}, Required: ${reductionForThisUnit}`
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

        if (mainUnitReductionQuantity > 0) {
            await this.softDeleteBatchIfEligible(tx, batchId, productId);
        }

        console.log('🎉 [StockBatchService] All units updated successfully. Total units:', results.length);

        return results;
    }

    private static async softDeleteBatchIfEligible(tx: any, batchId: string, productId: string) {
        const [batch] = await tx
            .select({
                id: stockBatchTable.id,
                maintainsId: stockBatchTable.maintainsId,
                deleted: stockBatchTable.deleted
            })
            .from(stockBatchTable)
            .where(eq(stockBatchTable.id, batchId));

        if (!batch || batch.deleted) return;

        const [product] = await tx
            .select({ mainUnitId: productTable.mainUnitId })
            .from(productTable)
            .where(eq(productTable.id, productId));
        const mainUnitId = product?.mainUnitId;
        if (!mainUnitId) return;

        const [currentQtyRow] = await tx
            .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)` })
            .from(stockTable)
            .where(and(
                eq(stockTable.stockBatchId, batchId),
                eq(stockTable.unitId, mainUnitId)
            ));
        const currentQty = Number(currentQtyRow?.total ?? 0);
        if (currentQty > 0) return;

        const otherActive = await tx
            .select({ id: stockBatchTable.id })
            .from(stockBatchTable)
            .innerJoin(stockTable, and(
                eq(stockTable.stockBatchId, stockBatchTable.id),
                eq(stockTable.unitId, mainUnitId)
            ))
            .where(and(
                eq(stockBatchTable.productId, productId),
                eq(stockBatchTable.maintainsId, batch.maintainsId),
                eq(stockBatchTable.deleted, false),
                sql`${stockBatchTable.id} <> ${batchId}`,
                sql`${stockTable.quantity} > 0`
            ))
            .limit(1);

        if (otherActive.length === 0) return;

        await tx
            .update(stockBatchTable)
            .set({ deleted: true, updatedAt: getCurrentDate() })
            .where(eq(stockBatchTable.id, batchId));
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
            .leftJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
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
            .innerJoin(stockBatchTable, and(eq(stockTable.stockBatchId, stockBatchTable.id), eq(stockBatchTable.deleted, false)))
            .innerJoin(productTable, eq(stockTable.productId, productTable.id))
            .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
            .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
            .where(and(eq(stockTable.stockBatchId, batchId), eq(stockBatchTable.id, batchId)))
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
            .where(and(eq(stockBatchTable.id, batchId), eq(stockBatchTable.deleted, false)));

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
            sql`${stockTable.quantity} > 0`,
            eq(stockBatchTable.deleted, false)
        ];

        if (unitId) {
            whereConditions.push(eq(stockTable.unitId, unitId));
        }

        return await db.select({
            stock: stockTable,
            batch: stockBatchTable
        })
            .from(stockTable)
            .innerJoin(stockBatchTable, eq(stockTable.stockBatchId, stockBatchTable.id))
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
            where: eq(stockBatchTable.deleted, false),
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
            .where(and(eq(stockBatchTable.id, batchId), eq(stockBatchTable.deleted, false)));

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

            if (existingStock.stockBatchId) {
                const [existingBatch] = await tx
                    .select({ id: stockBatchTable.id, deleted: stockBatchTable.deleted })
                    .from(stockBatchTable)
                    .where(eq(stockBatchTable.id, existingStock.stockBatchId));
                if (existingBatch?.deleted) {
                    throw new Error(`Stock batch is deleted: ${existingStock.stockBatchId}`);
                }
            }

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
                    if (unitPrice.pricePerQuantity < 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} cannot be negative`);
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
                .where(and(eq(stockBatchTable.id, batchId), eq(stockBatchTable.deleted, false)));

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
                    if (unitPrice.pricePerQuantity < 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} cannot be negative`);
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
                .where(and(
                    eq(stockBatchTable.productId, productId),
                    eq(stockBatchTable.maintainsId, maintainsId),
                    eq(stockBatchTable.deleted, false)
                ))
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
                }, tx);
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
                    }, tx);
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
                    if (unitPrice.pricePerQuantity < 0) {
                        throw new Error(`Price for unit ${unitPrice.unitId} cannot be negative`);
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
    static async processMultiBatchSale(
        saleItems: Array<{ stockBatchId: string, unitId: string, quantity: number }>,
        txArg?: any
    ) {
        const runSale = async (tx: any) => {
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
                const [batch] = await tx
                    .select()
                    .from(stockBatchTable)
                    .where(and(eq(stockBatchTable.id, stockBatchId), eq(stockBatchTable.deleted, false)));

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
                    throw new Error(`Insufficient stock in batch ${stockBatchId} for product "${product!.name}". Available: ${totalAvailableInMainUnit} main units, Required: ${batchData.totalMainUnitReduction} main units`);
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
        };

        if (txArg) {
            return await runSale(txArg);
        }

        return await db.transaction(runSale);
    }

    static async revertMultiBatchSale(
        saleItems: Array<{ stockBatchId: string, unitId: string, quantity: number }>,
        txArg?: any
    ) {
        const runRevert = async (tx: any) => {
            const batchReductions = new Map<string, {
                totalMainUnitReduction: number,
                saleItems: Array<{ unitId: string, quantity: number, mainUnitReduced: number }>,
                productId: string
            }>();

            for (const saleItem of saleItems) {
                const { stockBatchId, unitId, quantity } = saleItem;

                const [batch] = await tx.select().from(stockBatchTable).where(eq(stockBatchTable.id, stockBatchId));
                if (!batch) {
                    throw new Error(`Batch not found with ID: ${stockBatchId}`);
                }

                const [product] = await tx.select().from(productTable).where(eq(productTable.id, batch.productId));
                if (!product || !product.mainUnitId) {
                    throw new Error(`Product or main unit not found for product ID: ${batch.productId}`);
                }

                const unitConversions = await tx.select().from(unitConversionTable)
                    .where(eq(unitConversionTable.productId, batch.productId));

                const saleUnitConversion = unitConversions.find(uc => uc.unitId === unitId);
                if (!saleUnitConversion) {
                    throw new Error(`Unit conversion not found for product ${batch.productId} or sale unit ${unitId}`);
                }

                const mainUnitQuantityToRestore = Number(
                    (quantity / saleUnitConversion.conversionFactor).toFixed(3)
                );

                if (!batchReductions.has(stockBatchId)) {
                    batchReductions.set(stockBatchId, {
                        totalMainUnitReduction: 0,
                        saleItems: [],
                        productId: batch.productId
                    });
                }

                const batchData = batchReductions.get(stockBatchId)!;
                batchData.totalMainUnitReduction += mainUnitQuantityToRestore;
                batchData.saleItems.push({
                    unitId,
                    quantity,
                    mainUnitReduced: mainUnitQuantityToRestore
                });
            }

            const results = [];

            for (const [stockBatchId, batchData] of batchReductions) {
                const allUpdates = await this.updateAllUnitsInBatch(
                    tx,
                    stockBatchId,
                    batchData.productId,
                    -batchData.totalMainUnitReduction
                );

                await tx
                    .update(stockBatchTable)
                    .set({ deleted: false, updatedAt: getCurrentDate() })
                    .where(eq(stockBatchTable.id, stockBatchId));

                for (const saleItemData of batchData.saleItems) {
                    results.push({
                        stockBatchId,
                        saleUnitId: saleItemData.unitId,
                        saleQuantity: saleItemData.quantity,
                        mainUnitRestored: saleItemData.mainUnitReduced,
                        allUpdates
                    });
                }
            }

            return { totalItems: saleItems.length, results };
        };

        if (txArg) {
            return await runRevert(txArg);
        }

        return await db.transaction(runRevert);
    }

    /**
     * Clean up empty stock batches for a product in a specific outlet
     * Removes stock batches that have all stock quantities at 0, but only if there are other batches with stock > 0
     */
    static async cleanupEmptyStockBatches(productId: string, maintainsId: string, txArg?: any) {
        console.log('🧹 [StockBatchService] Starting cleanup for product:', productId, 'in outlet:', maintainsId);

        const runCleanup = async (tx: any) => {
            const [product] = await tx
                .select({ mainUnitId: productTable.mainUnitId })
                .from(productTable)
                .where(eq(productTable.id, productId));

            if (!product?.mainUnitId) {
                return { cleanedBatches: [], message: "No cleanup needed - product main unit not found" };
            }

            const batchInfo = await tx
                .select({
                    batchId: stockBatchTable.id,
                    batchNumber: stockBatchTable.batchNumber,
                    productionDate: stockBatchTable.productionDate,
                    mainUnitQuantity: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`
                })
                .from(stockBatchTable)
                .leftJoin(stockTable, and(
                    eq(stockTable.stockBatchId, stockBatchTable.id),
                    eq(stockTable.unitId, product.mainUnitId)
                ))
                .where(and(
                    eq(stockBatchTable.productId, productId),
                    eq(stockBatchTable.maintainsId, maintainsId),
                    eq(stockBatchTable.deleted, false)
                ))
                .groupBy(stockBatchTable.id, stockBatchTable.batchNumber, stockBatchTable.productionDate);

            if (batchInfo.length <= 1) {
                return { cleanedBatches: [], message: "No cleanup needed - insufficient batches" };
            }

            const batchesWithStock = batchInfo.filter(b => Number(b.mainUnitQuantity) > 0);
            const emptyBatches = batchInfo.filter(b => Number(b.mainUnitQuantity) <= 0);

            if (emptyBatches.length === 0) {
                return { cleanedBatches: [], message: "No cleanup needed - no empty batches found" };
            }

            if (batchesWithStock.length === 0) {
                return { cleanedBatches: [], message: "No cleanup needed - no other active batch exists" };
            }

            const cleanedBatches = [];
            for (const b of emptyBatches) {
                await tx
                    .update(stockBatchTable)
                    .set({ deleted: true, updatedAt: getCurrentDate() })
                    .where(eq(stockBatchTable.id, b.batchId));
                cleanedBatches.push({
                    batchId: b.batchId,
                    batchNumber: b.batchNumber
                });
            }

            return {
                cleanedBatches,
                message: `Soft-deleted ${cleanedBatches.length} empty batches`,
                remainingBatchesWithStock: batchesWithStock.length
            };
        };

        if (txArg) {
            return await runCleanup(txArg);
        }

        return await db.transaction(runCleanup);
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
