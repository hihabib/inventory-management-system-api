import { db } from "../drizzle/db";
import { saleTable } from "../drizzle/schema/sale";
import { productTable } from "../drizzle/schema/product";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { eq, isNull, and } from "drizzle-orm";

/**
 * Migration script to populate quantity_in_main_unit for existing sale records
 * 
 * This script calculates the main unit quantity for each sale based on:
 * 1. If sale unit matches product's main unit: quantity_in_main_unit = saleQuantity
 * 2. If sale unit is different: quantity_in_main_unit = saleQuantity / conversionFactor
 */
export async function populateSaleQuantityInMainUnit() {
    console.log('🚀 Starting migration: Populate quantity_in_main_unit for existing sales');
    
    try {
        // Get all sales where quantity_in_main_unit is null
        const salesWithNullMainQuantity = await db
            .select({
                id: saleTable.id,
                productId: saleTable.productId,
                saleQuantity: saleTable.saleQuantity,
                unit: saleTable.unit
            })
            .from(saleTable)
            .where(isNull(saleTable.quantityInMainUnit));

        console.log(`📊 Found ${salesWithNullMainQuantity.length} sales to process`);

        if (salesWithNullMainQuantity.length === 0) {
            console.log('✅ No sales to process. Migration completed.');
            return;
        }

        let processedCount = 0;
        let errorCount = 0;

        // Process sales in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < salesWithNullMainQuantity.length; i += batchSize) {
            const batch = salesWithNullMainQuantity.slice(i, i + batchSize);
            
            console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(salesWithNullMainQuantity.length / batchSize)}`);

            for (const sale of batch) {
                try {
                    // Get product information
                    const [product] = await db
                        .select({
                            id: productTable.id,
                            mainUnitId: productTable.mainUnitId
                        })
                        .from(productTable)
                        .where(eq(productTable.id, sale.productId));

                    if (!product) {
                        console.warn(`⚠️ Product not found for sale ${sale.id}, skipping`);
                        errorCount++;
                        continue;
                    }

                    if (!product.mainUnitId) {
                        console.warn(`⚠️ Product ${product.id} has no main unit, skipping sale ${sale.id}`);
                        errorCount++;
                        continue;
                    }

                    let quantityInMainUnit: number;

                    // Check if sale unit is the same as product's main unit
                    if (sale.unit === product.mainUnitId) {
                        // Direct conversion: sale quantity is already in main unit
                        quantityInMainUnit = Number(sale.saleQuantity);
                    } else {
                        // Need to convert using unit conversion table
                        const [unitConversion] = await db
                            .select({
                                conversionFactor: unitConversionTable.conversionFactor
                            })
                            .from(unitConversionTable)
                            .where(
                                and(
                                    eq(unitConversionTable.productId, sale.productId),
                                    eq(unitConversionTable.unitId, sale.unit)
                                )
                            );

                        if (!unitConversion) {
                            console.warn(`⚠️ Unit conversion not found for product ${sale.productId} and unit ${sale.unit}, skipping sale ${sale.id}`);
                            errorCount++;
                            continue;
                        }

                        // Convert to main unit: saleQuantity / conversionFactor
                        quantityInMainUnit = Number((Number(sale.saleQuantity) / unitConversion.conversionFactor).toFixed(3));
                    }

                    // Update the sale record
                    await db
                        .update(saleTable)
                        .set({
                            quantityInMainUnit: quantityInMainUnit
                        })
                        .where(eq(saleTable.id, sale.id));

                    processedCount++;

                    if (processedCount % 50 === 0) {
                        console.log(`✅ Processed ${processedCount} sales so far...`);
                    }

                } catch (error) {
                    console.error(`❌ Error processing sale ${sale.id}:`, error);
                    errorCount++;
                }
            }
        }

        console.log('🎉 Migration completed!');
        console.log(`✅ Successfully processed: ${processedCount} sales`);
        console.log(`❌ Errors encountered: ${errorCount} sales`);
        
        if (errorCount > 0) {
            console.log('⚠️ Some sales could not be processed. Please review the warnings above.');
        }

    } catch (error) {
        console.error('💥 Migration failed:', error);
        throw error;
    }
}

// Run the migration if this file is executed directly
if (require.main === module) {
    populateSaleQuantityInMainUnit()
        .then(() => {
            console.log('Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration script failed:', error);
            process.exit(1);
        });
}