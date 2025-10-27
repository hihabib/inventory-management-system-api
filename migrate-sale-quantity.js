require('dotenv').config();
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { eq, isNull, and } = require('drizzle-orm');

// Parse DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
}

// Create pool using DATABASE_URL
const pool = new Pool({
    connectionString: databaseUrl,
});

const db = drizzle(pool);

async function populateSaleQuantityInMainUnit() {
    console.log('🚀 Starting migration: Populate quantity_in_main_unit for existing sales');
    
    try {
        // Raw SQL query to get sales with null quantity_in_main_unit
        const salesQuery = `
            SELECT s.id, s.product_id, s.sale_quantity, s.unit
            FROM sale s
            WHERE s.quantity_in_main_unit IS NULL
        `;
        
        const salesResult = await pool.query(salesQuery);
        const sales = salesResult.rows;
        
        console.log(`📊 Found ${sales.length} sales to process`);

        if (sales.length === 0) {
            console.log('✅ No sales to process. Migration completed.');
            return;
        }

        let processedCount = 0;
        let errorCount = 0;

        for (const sale of sales) {
            try {
                // Get product information
                const productQuery = `
                    SELECT id, main_unit_id
                    FROM product
                    WHERE id = $1
                `;
                const productResult = await pool.query(productQuery, [sale.product_id]);
                
                if (productResult.rows.length === 0) {
                    console.warn(`⚠️ Product not found for sale ${sale.id}, skipping`);
                    errorCount++;
                    continue;
                }

                const product = productResult.rows[0];
                
                if (!product.main_unit_id) {
                    console.warn(`⚠️ Product ${product.id} has no main unit, skipping sale ${sale.id}`);
                    errorCount++;
                    continue;
                }

                let quantityInMainUnit;

                // Get the main unit name for comparison
                const mainUnitQuery = `
                    SELECT u.name as main_unit_name
                    FROM units u
                    WHERE u.id = $1
                `;
                const mainUnitResult = await pool.query(mainUnitQuery, [product.main_unit_id]);
                
                if (mainUnitResult.rows.length === 0) {
                    console.warn(`⚠️ Main unit not found for product ${product.id}, skipping sale ${sale.id}`);
                    errorCount++;
                    continue;
                }

                const mainUnitName = mainUnitResult.rows[0].main_unit_name;

                // Check if sale unit is the same as product's main unit
                if (sale.unit === mainUnitName) {
                    // Direct conversion: sale quantity is already in main unit
                    quantityInMainUnit = parseFloat(sale.sale_quantity);
                } else {
                    // Need to convert using unit conversion table
                    // First, get the unit ID for the sale unit name
                    const saleUnitQuery = `
                        SELECT id
                        FROM units
                        WHERE name = $1
                    `;
                    const saleUnitResult = await pool.query(saleUnitQuery, [sale.unit]);

                    let saleUnitId;
                    if (saleUnitResult.rows.length === 0) {
                        console.log(`ℹ️ Sale unit '${sale.unit}' not found in units table, using factor 1 for sale ${sale.id}`);
                        // Use conversion factor 1 directly when unit is not found
                        quantityInMainUnit = parseFloat(sale.sale_quantity);
                    } else {
                            saleUnitId = saleUnitResult.rows[0].id;

                        // Now get the conversion factor
                        const conversionQuery = `
                            SELECT conversion_factor
                            FROM unit_conversion
                            WHERE product_id = $1 AND unit_id = $2
                        `;
                        const conversionResult = await pool.query(conversionQuery, [sale.product_id, saleUnitId]);

                        let conversionFactor;
                        if (conversionResult.rows.length === 0) {
                            console.log(`ℹ️ Unit conversion not found for product ${sale.product_id} and unit ${sale.unit}, using factor 1 for sale ${sale.id}`);
                            conversionFactor = 1;
                        } else {
                            conversionFactor = parseFloat(conversionResult.rows[0].conversion_factor);
                        }
                        
                        // Convert to main unit: saleQuantity / conversionFactor
                        quantityInMainUnit = parseFloat((parseFloat(sale.sale_quantity) / conversionFactor).toFixed(3));
                    }
                }

                // Update the sale record
                const updateQuery = `
                    UPDATE sale
                    SET quantity_in_main_unit = $1
                    WHERE id = $2
                `;
                await pool.query(updateQuery, [quantityInMainUnit, sale.id]);

                processedCount++;

                if (processedCount % 50 === 0) {
                    console.log(`✅ Processed ${processedCount} sales so far...`);
                }

            } catch (error) {
                console.error(`❌ Error processing sale ${sale.id}:`, error.message);
                errorCount++;
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
    } finally {
        await pool.end();
    }
}

// Run the migration
populateSaleQuantityInMainUnit()
    .then(() => {
        console.log('Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });