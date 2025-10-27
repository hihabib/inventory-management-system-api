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
 * Verification script for main_unit_price migration
 */
async function verifyMainUnitPrice() {
    console.log('🔍 Starting verification: main_unit_price migration results');
    
    try {
        // Get total count of sales
        const totalQuery = `SELECT COUNT(*) as total FROM sale`;
        const totalResult = await pool.query(totalQuery);
        const totalSales = parseInt(totalResult.rows[0].total);

        // Get count of sales with main_unit_price filled
        const filledQuery = `SELECT COUNT(*) as filled FROM sale WHERE main_unit_price IS NOT NULL`;
        const filledResult = await pool.query(filledQuery);
        const filledSales = parseInt(filledResult.rows[0].filled);

        // Get count of sales with main_unit_price null
        const nullQuery = `SELECT COUNT(*) as null_count FROM sale WHERE main_unit_price IS NULL`;
        const nullResult = await pool.query(nullQuery);
        const nullSales = parseInt(nullResult.rows[0].null_count);

        // Calculate success rate
        const successRate = ((filledSales / totalSales) * 100).toFixed(2);

        console.log('📊 Migration Results:');
        console.log(`   Total sales: ${totalSales}`);
        console.log(`   Sales with main_unit_price: ${filledSales}`);
        console.log(`   Sales with NULL main_unit_price: ${nullSales}`);
        console.log(`   Success rate: ${successRate}%`);

        // Get sample of NULL records for analysis
        if (nullSales > 0) {
            console.log('\n🔍 Sample of records with NULL main_unit_price:');
            const sampleQuery = `
                SELECT s.id, s.product_id, s.maintains_id, p.main_unit_id
                FROM sale s
                LEFT JOIN product p ON s.product_id = p.id
                WHERE s.main_unit_price IS NULL
                LIMIT 5
            `;
            const sampleResult = await pool.query(sampleQuery);
            sampleResult.rows.forEach((row, index) => {
                console.log(`   ${index + 1}. Sale ID: ${row.id}`);
                console.log(`      Product ID: ${row.product_id}`);
                console.log(`      Maintains ID: ${row.maintains_id}`);
                console.log(`      Main Unit ID: ${row.main_unit_id}`);
            });
        }

        // Get sample of filled records
        console.log('\n✅ Sample of records with main_unit_price filled:');
        const filledSampleQuery = `
            SELECT s.id, s.product_id, s.main_unit_price
            FROM sale s
            WHERE s.main_unit_price IS NOT NULL
            LIMIT 5
        `;
        const filledSampleResult = await pool.query(filledSampleQuery);
        filledSampleResult.rows.forEach((row, index) => {
            console.log(`   ${index + 1}. Sale ID: ${row.id}`);
            console.log(`      Product ID: ${row.product_id}`);
            console.log(`      Main Unit Price: $${row.main_unit_price}`);
        });

        console.log('\n🎉 Verification completed successfully!');

    } catch (error) {
        console.error('💥 Verification failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the verification
if (require.main === module) {
    verifyMainUnitPrice()
        .then(() => {
            console.log('✅ Verification script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Verification script failed:', error);
            process.exit(1);
        });
}

module.exports = { verifyMainUnitPrice };