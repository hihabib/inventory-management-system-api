import { db } from "./src/api/v1/drizzle/db";
import { dailyStockRecordTable } from "./src/api/v1/drizzle/schema/dailyStockRecord";
import { eq, and, gte, lt, lte, desc } from "drizzle-orm";

async function comprehensiveStockAnalysis() {
    console.log("📊 Comprehensive Stock Analysis");
    console.log("=" .repeat(60));

    const testMaintainsId = "5cf2c18d-8738-4d95-ad56-edeeab190fba";
    const testProductId = "b8e4b71e-f42c-4617-991a-79c673151a82";
    const testDate = "2025-10-29T18:00:00.000Z";
    
    const inputDate = new Date(testDate);
    const startDate = new Date(inputDate);
    const endDate = new Date(inputDate.getTime() + 24 * 60 * 60 * 1000);

    console.log(`🎯 Target Analysis:`);
    console.log(`   Product ID: ${testProductId}`);
    console.log(`   Target Date: ${testDate} (UTC)`);
    console.log(`   Target Date: Oct 30, 2025 (Dhaka time)`);
    console.log(`   Looking for "previous stock" = stock before Oct 30, 2025`);
    console.log();

    try {
        // Get ALL stock records for this product, ordered by creation date
        console.log("📋 ALL stock records for this product (chronological order):");
        const allRecords = await db
            .select()
            .from(dailyStockRecordTable)
            .where(
                and(
                    eq(dailyStockRecordTable.maintainsId, testMaintainsId),
                    eq(dailyStockRecordTable.productId, testProductId)
                )
            )
            .orderBy(dailyStockRecordTable.createdAt);

        console.log(`📊 Total records found: ${allRecords.length}`);
        
        if (allRecords.length === 0) {
            console.log("❌ No stock records found for this product!");
            return;
        }

        let cumulativeQuantity = 0;
        let cumulativeValue = 0;

        allRecords.forEach((record, index) => {
            const createdAtUTC = new Date(record.createdAt);
            const createdAtDhaka = createdAtUTC.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
            
            cumulativeQuantity += record.quantity;
            cumulativeValue += record.quantity * record.pricePerQuantity;
            
            console.log(`\n${index + 1}. Record created: ${createdAtDhaka} (Dhaka)`);
            console.log(`   UTC: ${createdAtUTC.toISOString()}`);
            console.log(`   Quantity: ${record.quantity}`);
            console.log(`   Price per unit: ${record.pricePerQuantity}`);
            console.log(`   Record value: ${record.quantity * record.pricePerQuantity}`);
            console.log(`   📈 Cumulative quantity: ${cumulativeQuantity}`);
            console.log(`   📈 Cumulative value: ${cumulativeValue}`);
            
            // Check relationship to our target date
            if (createdAtUTC < startDate) {
                console.log(`   ✅ This is BEFORE Oct 30 → Should be in "previous stock"`);
            } else if (createdAtUTC >= startDate && createdAtUTC < endDate) {
                console.log(`   📅 This is DURING Oct 30 → Should NOT be in "previous stock"`);
            } else {
                console.log(`   ⏭️ This is AFTER Oct 30 → Future record`);
            }
        });

        // Calculate what "previous stock" should be
        console.log(`\n🧮 Previous Stock Calculation:`);
        const previousStockRecords = allRecords.filter(record => 
            new Date(record.createdAt) < startDate
        );
        
        const previousStockQuantity = previousStockRecords.reduce((sum, record) => sum + record.quantity, 0);
        const previousStockValue = previousStockRecords.reduce((sum, record) => sum + (record.quantity * record.pricePerQuantity), 0);
        
        console.log(`   Records before Oct 30: ${previousStockRecords.length}`);
        console.log(`   Previous stock quantity: ${previousStockQuantity}`);
        console.log(`   Previous stock value: ${previousStockValue}`);

        // Calculate stock during the target day
        console.log(`\n📅 Stock Changes During Oct 30:`);
        const targetDayRecords = allRecords.filter(record => {
            const createdAt = new Date(record.createdAt);
            return createdAt >= startDate && createdAt < endDate;
        });
        
        const targetDayQuantity = targetDayRecords.reduce((sum, record) => sum + record.quantity, 0);
        const targetDayValue = targetDayRecords.reduce((sum, record) => sum + (record.quantity * record.pricePerQuantity), 0);
        
        console.log(`   Records during Oct 30: ${targetDayRecords.length}`);
        console.log(`   Quantity added during Oct 30: ${targetDayQuantity}`);
        console.log(`   Value added during Oct 30: ${targetDayValue}`);

        // Final stock at end of day
        console.log(`\n📊 Final Analysis:`);
        console.log(`   Stock at start of Oct 30: ${previousStockQuantity} (previous stock)`);
        console.log(`   Stock added during Oct 30: ${targetDayQuantity}`);
        console.log(`   Stock at end of Oct 30: ${previousStockQuantity + targetDayQuantity}`);

        console.log("\n" + "=".repeat(60));
        console.log("✅ Analysis completed!");
        
    } catch (error) {
        console.error("❌ Analysis failed:", error);
        throw error;
    }
}

comprehensiveStockAnalysis()
    .then(() => {
        console.log("🎉 Analysis completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Analysis failed:", error);
        process.exit(1);
    });