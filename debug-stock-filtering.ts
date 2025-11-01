import { db } from "./src/api/v1/drizzle/db";
import { dailyStockRecordTable } from "./src/api/v1/drizzle/schema/dailyStockRecord";
import { eq, and, gte, lt, lte } from "drizzle-orm";

async function debugStockFiltering() {
    console.log("🔍 Debug Stock Filtering Logic");
    console.log("=" .repeat(50));

    const testMaintainsId = "5cf2c18d-8738-4d95-ad56-edeeab190fba";
    const testProductId = "b8e4b71e-f42c-4617-991a-79c673151a82";
    const testDate = "2025-10-29T18:00:00.000Z";
    
    // Current logic from the method
    const inputDate = new Date(testDate);
    const startDate = new Date(inputDate);
    const endDate = new Date(inputDate.getTime() + 24 * 60 * 60 * 1000);

    console.log(`📅 Date Analysis:`);
    console.log(`   Input: ${testDate}`);
    console.log(`   Start Date (UTC): ${startDate.toISOString()}`);
    console.log(`   End Date (UTC): ${endDate.toISOString()}`);
    console.log(`   Start Date (Dhaka): ${startDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`);
    console.log(`   End Date (Dhaka): ${endDate.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`);
    console.log();

    try {
        // Check all records for this product
        console.log("🔍 All stock records for this product:");
        const allRecords = await db
            .select()
            .from(dailyStockRecordTable)
            .where(
                and(
                    eq(dailyStockRecordTable.maintainsId, testMaintainsId),
                    eq(dailyStockRecordTable.productId, testProductId)
                )
            );

        console.log(`📊 Total records found: ${allRecords.length}`);
        
        allRecords.forEach((record, index) => {
            const createdAtUTC = new Date(record.createdAt);
            const createdAtDhaka = createdAtUTC.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
            
            console.log(`\n${index + 1}. Record ID: ${record.id}`);
            console.log(`   Created At (UTC): ${createdAtUTC.toISOString()}`);
            console.log(`   Created At (Dhaka): ${createdAtDhaka}`);
            console.log(`   Quantity: ${record.quantity}`);
            console.log(`   Price per Quantity: ${record.pricePerQuantity}`);
            
            // Check if this record would be included in current logic
            const isIncludedInCurrentLogic = createdAtUTC <= startDate;
            console.log(`   ❓ Included in "previous stock" (current logic): ${isIncludedInCurrentLogic}`);
            
            // Check if this record is from the target day
            const isFromTargetDay = createdAtUTC >= startDate && createdAtUTC < endDate;
            console.log(`   📅 Is from target day (Oct 30): ${isFromTargetDay}`);
        });

        // Test current filtering logic
        console.log(`\n🔍 Current filtering logic (lte startDate):`);
        const currentLogicRecords = await db
            .select()
            .from(dailyStockRecordTable)
            .where(
                and(
                    eq(dailyStockRecordTable.maintainsId, testMaintainsId),
                    eq(dailyStockRecordTable.productId, testProductId),
                    lte(dailyStockRecordTable.createdAt, startDate)
                )
            );

        console.log(`📊 Records included in "previous stock": ${currentLogicRecords.length}`);
        
        // Test correct filtering logic (should be lt startDate)
        console.log(`\n🔍 Correct filtering logic (lt startDate):`);
        const correctLogicRecords = await db
            .select()
            .from(dailyStockRecordTable)
            .where(
                and(
                    eq(dailyStockRecordTable.maintainsId, testMaintainsId),
                    eq(dailyStockRecordTable.productId, testProductId),
                    lt(dailyStockRecordTable.createdAt, startDate)
                )
            );

        console.log(`📊 Records that should be in "previous stock": ${correctLogicRecords.length}`);

        console.log("\n" + "=".repeat(50));
        console.log("✅ Debug completed!");
        
    } catch (error) {
        console.error("❌ Debug failed:", error);
        throw error;
    }
}

debugStockFiltering()
    .then(() => {
        console.log("🎉 Debug completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Debug failed:", error);
        process.exit(1);
    });