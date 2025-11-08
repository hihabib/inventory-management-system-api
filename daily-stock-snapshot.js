#!/usr/bin/env node

require('dotenv/config');
const { drizzle } = require('drizzle-orm/node-postgres');
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

const db = drizzle(pool);


async function createDailyStockSnapshot() {
    try {
        console.log('🚀 Starting daily stock snapshot...');
        // Insert all eligible rows directly from stock, skipping null product_id
        console.log('💾 Inserting data into daily_stock_record table...');
        const insertQuery = `
            INSERT INTO daily_stock_record (
                maintains_id,
                product_id,
                unit_id,
                quantity,
                price_per_quantity,
                created_at,
                updated_at
            )
            SELECT 
                maintains_id,
                product_id,
                unit_id,
                quantity,
                price_per_quantity,
                now() as created_at,
                now() as updated_at
            FROM stock
            WHERE product_id IS NOT NULL
            RETURNING id
        `;

        const insertResult = await db.execute(insertQuery);

        console.log(`✅ Successfully inserted ${insertResult.rows.length} records into daily_stock_record table`);
        console.log('🎉 Daily stock snapshot completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during daily stock snapshot:', error);
        throw error;
    } finally {
        // Close the database connection
        await pool.end();
        console.log('🔌 Database connection closed');
    }
}

// Run the snapshot function
if (require.main === module) {
    createDailyStockSnapshot()
        .then(() => {
            console.log('📋 Script execution completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Script failed:', error);
            process.exit(1);
        });
}

module.exports = { createDailyStockSnapshot };