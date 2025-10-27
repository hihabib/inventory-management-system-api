require('dotenv').config();
const { Pool } = require('pg');

// Parse DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
}

// Create pool using DATABASE_URL
const pool = new Pool({
    connectionString: databaseUrl,
});

/**
 * Migration script to populate main_unit_price for existing sale records
 * 
 * This script fills the main_unit_price field for all existing sales by:
 * 1. Finding the product's main unit ID
 * 2. Looking up the most recent price_per_quantity from stock table
 * 3. Using product_id, maintains_id, and main unit ID as filters
 */
async function populateMainUnitPrice() {
    console.log('🚀 Starting migration: Populate main_unit_price for existing sales');
    
    try {
        // Get all sales where main_unit_price is null
        const salesQuery = `
            SELECT s.id, s.product_id, s.maintains_id
            FROM sale s
            WHERE s.main_unit_price IS NULL
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
                // Get product's main unit ID
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

                // Find the most recent price_per_quantity from stock table
                const stockQuery = `
                    SELECT price_per_quantity
                    FROM stock
                    WHERE product_id = $1 
                      AND maintains_id = $2 
                      AND unit_id = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                
                const stockResult = await pool.query(stockQuery, [
                    sale.product_id,
                    sale.maintains_id,
                    product.main_unit_id
                ]);

                if (stockResult.rows.length === 0) {
                    console.warn(`⚠️ No stock price found for sale ${sale.id} (product: ${sale.product_id}, maintains: ${sale.maintains_id}, main unit: ${product.main_unit_id}), skipping`);
                    errorCount++;
                    continue;
                }

                const mainUnitPrice = stockResult.rows[0].price_per_quantity;

                // Update the sale record with main_unit_price
                const updateQuery = `
                    UPDATE sale
                    SET main_unit_price = $1
                    WHERE id = $2
                `;
                
                await pool.query(updateQuery, [mainUnitPrice, sale.id]);
                
                processedCount++;
                
                if (processedCount % 100 === 0) {
                    console.log(`📈 Processed ${processedCount} sales so far...`);
                }

            } catch (error) {
                console.error(`❌ Error processing sale ${sale.id}:`, error.message);
                errorCount++;
            }
        }

        console.log(`✅ Migration completed!`);
        console.log(`📊 Total sales processed: ${processedCount}`);
        console.log(`❌ Total errors: ${errorCount}`);
        console.log(`📈 Success rate: ${((processedCount / sales.length) * 100).toFixed(2)}%`);

    } catch (error) {
        console.error('💥 Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the migration
if (require.main === module) {
    populateMainUnitPrice()
        .then(() => {
            console.log('🎉 Migration script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { populateMainUnitPrice };