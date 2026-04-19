import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { stockTable } from "../api/v1/drizzle/schema/stock";
import { stockBatchTable } from "../api/v1/drizzle/schema/stockBatch";
import { productTable } from "../api/v1/drizzle/schema/product";
import { unitTable } from "../api/v1/drizzle/schema/unit";
import { maintainsTable } from "../api/v1/drizzle/schema/maintains";

interface StockWithBatchInfo {
    stockId: string;
    productId: string;
    productName: string;
    maintainsId: string;
    maintainsName: string;
    unitId: string;
    unitName: string;
    stockBatchId: string;
    stockBatchCreatedAt: Date;
    quantity: number;
    pricePerQuantity: number;
}

type StockGroupKey = string; // `${productId}|${maintainsId}|${unitId}`
type StockGroup = {
    key: StockGroupKey;
    productId: string;
    productName: string;
    maintainsId: string;
    maintainsName: string;
    unitId: string;
    unitName: string;
    stocks: StockWithBatchInfo[];
    latestBatchId: string;
    latestBatchDate: Date;
    stocksToDelete: StockWithBatchInfo[];
};

const DRY_RUN = process.env.DRY_RUN !== "false";

async function main() {
    console.log("=".repeat(80));
    console.log("Stock Cleanup Script: Remove Old Stock Batches");
    console.log("=".repeat(80));
    console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes will be made)" : "LIVE (will delete records)"}`);
    console.log("");

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);

    // Step 1: Fetch all stock records with batch information
    console.log("Step 1: Fetching all stock records with batch information...");
    const allStocks = await db
        .select({
            stockId: stockTable.id,
            productId: stockTable.productId,
            maintainsId: stockTable.maintainsId,
            unitId: stockTable.unitId,
            stockBatchId: stockTable.stockBatchId,
            quantity: stockTable.quantity,
            pricePerQuantity: stockTable.pricePerQuantity,
            stockBatchCreatedAt: stockBatchTable.createdAt,
            productName: productTable.name,
            maintainsName: maintainsTable.name,
            unitName: unitTable.name,
        })
        .from(stockTable)
        .innerJoin(stockBatchTable, and(
            eq(stockTable.stockBatchId, stockBatchTable.id),
            eq(stockBatchTable.deleted, false)
        ))
        .innerJoin(productTable, eq(stockTable.productId, productTable.id))
        .innerJoin(maintainsTable, eq(stockTable.maintainsId, maintainsTable.id))
        .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id));

    console.log(`Found ${allStocks.length} total stock records.`);

    if (allStocks.length === 0) {
        console.log("No stock records found. Exiting.");
        await pool.end();
        return;
    }

    // Step 2: Group by (productId, maintainsId, unitId)
    console.log("\nStep 2: Grouping stocks by product-outlet-unit combination...");
    const groups = new Map<StockGroupKey, StockGroup>();

    for (const stock of allStocks as StockWithBatchInfo[]) {
        const key: StockGroupKey = `${stock.productId}|${stock.maintainsId}|${stock.unitId}`;

        if (!groups.has(key)) {
            groups.set(key, {
                key,
                productId: stock.productId,
                productName: stock.productName,
                maintainsId: stock.maintainsId,
                maintainsName: stock.maintainsName,
                unitId: stock.unitId,
                unitName: stock.unitName,
                stocks: [],
                latestBatchId: stock.stockBatchId,
                latestBatchDate: new Date(stock.stockBatchCreatedAt),
                stocksToDelete: [],
            });
        }

        const group = groups.get(key)!;
        group.stocks.push(stock);

        // Track the latest batch
        const batchDate = new Date(stock.stockBatchCreatedAt);
        if (batchDate > group.latestBatchDate) {
            group.latestBatchId = stock.stockBatchId;
            group.latestBatchDate = batchDate;
        }
    }

    console.log(`Found ${groups.size} unique product-outlet-unit combinations.`);

    // Step 3: Identify stocks to delete (all except latest batch)
    console.log("\nStep 3: Identifying old stock records to delete...");
    let totalStocksKept = 0;
    let totalStocksToDelete = 0;
    let groupsWithOldStocks = 0;

    for (const group of groups.values()) {
        // Find stocks from old batches
        const oldStocks = group.stocks.filter(
            s => s.stockBatchId !== group.latestBatchId
        );
        const keptStocks = group.stocks.filter(
            s => s.stockBatchId === group.latestBatchId
        );

        group.stocksToDelete = oldStocks;
        totalStocksKept += keptStocks.length;
        totalStocksToDelete += oldStocks.length;

        if (oldStocks.length > 0) {
            groupsWithOldStocks++;
        }
    }

    console.log(`Groups with old stocks: ${groupsWithOldStocks}`);
    console.log(`Total stocks to keep: ${totalStocksKept}`);
    console.log(`Total stocks to delete: ${totalStocksToDelete}`);

    // Step 4: Show preview of deletions
    if (totalStocksToDelete > 0) {
        console.log("\nStep 4: Preview of deletions (first 10 groups)...");
        let previewCount = 0;
        for (const group of groups.values()) {
            if (group.stocksToDelete.length > 0 && previewCount < 10) {
                console.log(`\n  Product: "${group.productName}" | Outlet: "${group.maintainsName}" | Unit: "${group.unitName}"`);
                console.log(`    Latest batch: ${group.latestBatchId} (${group.latestBatchDate.toISOString()})`);
                console.log(`    Keeping ${group.stocks.filter(s => s.stockBatchId === group.latestBatchId).length} stock(s)`);
                console.log(`    Deleting ${group.stocksToDelete.length} old stock(s):`);
                for (const oldStock of group.stocksToDelete) {
                    console.log(`      - Batch: ${oldStock.stockBatchId} (${new Date(oldStock.stockBatchCreatedAt).toISOString()}) | Qty: ${oldStock.quantity} | Price: ${oldStock.pricePerQuantity}`);
                }
                previewCount++;
            }
        }

        if (groupsWithOldStocks > 10) {
            console.log(`\n  ... and ${groupsWithOldStocks - 10} more groups.`);
        }
    }

    // Step 5: Execute deletion (or skip if dry run)
    if (totalStocksToDelete > 0) {
        console.log(`\nStep 5: ${DRY_RUN ? "DRY RUN - Would delete" : "Deleting"} old stock records...`);

        if (!DRY_RUN) {
            let deletedCount = 0;
            const stockIdsToDelete: string[] = [];

            // Collect all stock IDs to delete
            for (const group of groups.values()) {
                for (const stock of group.stocksToDelete) {
                    stockIdsToDelete.push(stock.stockId);
                }
            }

            // Delete in batches of 100
            const batchSize = 100;
            for (let i = 0; i < stockIdsToDelete.length; i += batchSize) {
                const batch = stockIdsToDelete.slice(i, i + batchSize);

                for (const stockId of batch) {
                    const deleted = await db
                        .delete(stockTable)
                        .where(eq(stockTable.id, stockId))
                        .returning();

                    if (deleted.length > 0) {
                        deletedCount++;
                    }
                }

                console.log(`  Deleted ${deletedCount}/${stockIdsToDelete.length} records...`);
            }

            console.log(`\n✓ Successfully deleted ${deletedCount} old stock records.`);
        } else {
            console.log("  DRY RUN mode - no records were actually deleted.");
            console.log(`  To actually delete, run: DRY_RUN=false npx tsx src/test-scripts/cleanup-old-stock-batches.ts`);
        }
    } else {
        console.log("\nNo old stock records found. Database is already clean!");
    }

    // Step 6: Verification summary
    console.log("\n" + "=".repeat(80));
    console.log("Summary");
    console.log("=".repeat(80));
    console.log(`Total product-outlet-unit combinations: ${groups.size}`);
    console.log(`Combinations with old stocks: ${groupsWithOldStocks}`);
    console.log(`Stock records before: ${allStocks.length}`);
    console.log(`Stock records to keep: ${totalStocksKept}`);
    console.log(`Stock records to delete: ${totalStocksToDelete}`);
    console.log(`Expected stock records after: ${totalStocksKept}`);
    console.log("=".repeat(80));

    await pool.end();
}

main()
    .then(() => {
        console.log("\nDone.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("\nError:", err);
        process.exit(1);
    });
