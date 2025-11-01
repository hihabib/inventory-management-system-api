import { db } from './src/api/v1/drizzle/db';
import { dailyStockRecordTable } from "./src/api/v1/drizzle/schema/dailyStockRecord";
import { eq, and, gte, lt, lte } from 'drizzle-orm';

async function understandUserExpectation() {
    console.log('=== Understanding User Expectation for "Previous Stock" ===\n');
    
    const testMaintainsId = '5cf2c18d-8738-4d95-ad56-edeeab190fba';
    const testProductId = 'b8e4b71e-f42c-4617-991a-79c673151a82';
    const testDate = new Date('2025-10-29T18:00:00.000Z'); // User's input date
    
    console.log('Input Parameters:');
    console.log(`- maintains_id: ${testMaintainsId}`);
    console.log(`- product_id: ${testProductId}`);
    console.log(`- input date: ${testDate.toISOString()}`);
    console.log(`- input date (Dhaka): ${testDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}\n`);
    
    // Get all stock records for this product
    const allStockRecords = await db
        .select()
        .from(dailyStockRecordTable)
        .where(
            and(
                eq(dailyStockRecordTable.productId, testProductId),
                eq(dailyStockRecordTable.maintainsId, testMaintainsId)
            )
        )
        .orderBy(dailyStockRecordTable.createdAt);
    
    console.log('All Stock Records for this Product:');
    allStockRecords.forEach((record, index) => {
        const createdAtUTC = new Date(record.createdAt);
        const createdAtDhaka = createdAtUTC.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
        console.log(`${index + 1}. Created: ${record.createdAt} (UTC) = ${createdAtDhaka} (Dhaka)`);
        console.log(`   Quantity: ${record.quantity}, Price: ${record.pricePerQuantity}`);
    });
    
    console.log('\n=== Different Interpretations of "Previous Stock" ===\n');
    
    // Interpretation 1: Current logic - stock before the target day starts
    const startDate = new Date(testDate);
    console.log('1. Current Logic: Stock records created BEFORE the target day starts');
    console.log(`   Filter: createdAt <= ${startDate.toISOString()} (${startDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} Dhaka)`);
    
    const currentLogicRecords = allStockRecords.filter(record => {
        const createdAt = new Date(record.createdAt);
        return createdAt <= startDate;
    });
    
    const currentLogicTotal = currentLogicRecords.reduce((sum, record) => sum + record.quantity, 0);
    console.log(`   Records found: ${currentLogicRecords.length}`);
    console.log(`   Total quantity: ${currentLogicTotal}\n`);
    
    // Interpretation 2: Stock records created before the end of target day
    const endDate = new Date(testDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    console.log('2. Alternative Logic: Stock records created BEFORE the target day ends');
    console.log(`   Filter: createdAt < ${endDate.toISOString()} (${endDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} Dhaka)`);
    
    const alternativeLogicRecords = allStockRecords.filter(record => {
        const createdAt = new Date(record.createdAt);
        return createdAt < endDate;
    });
    
    const alternativeLogicTotal = alternativeLogicRecords.reduce((sum, record) => sum + record.quantity, 0);
    console.log(`   Records found: ${alternativeLogicRecords.length}`);
    console.log(`   Total quantity: ${alternativeLogicTotal}\n`);
    
    // Interpretation 3: All stock records up to and including the target day
    console.log('3. User Expected Logic: Stock records created UP TO AND INCLUDING the target day');
    console.log(`   Filter: createdAt <= ${endDate.toISOString()} (before next day starts)`);
    
    const userExpectedRecords = allStockRecords.filter(record => {
        const createdAt = new Date(record.createdAt);
        return createdAt <= endDate;
    });
    
    const userExpectedTotal = userExpectedRecords.reduce((sum, record) => sum + record.quantity, 0);
    console.log(`   Records found: ${userExpectedRecords.length}`);
    console.log(`   Total quantity: ${userExpectedTotal}\n`);
    
    console.log('=== Analysis ===');
    console.log(`Current API returns: previousStockQuantity = ${currentLogicTotal}`);
    console.log(`User expects: previousStockQuantity = ${userExpectedTotal} (based on SQL result showing quantity: 5)`);
    console.log(`\nThe user seems to expect "previous stock" to include stock records created during the target day.`);
    console.log(`This suggests "previous stock" means "stock available at the end of the target day" rather than "stock available at the beginning of the target day".`);
}

understandUserExpectation().catch(console.error);