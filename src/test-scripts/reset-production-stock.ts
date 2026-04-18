import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { deliveryHistoryTable } from "../api/v1/drizzle/schema/deliveryHistory";
import { stockAllocationAuditTable } from "../api/v1/drizzle/schema/stockAllocationAudit";
import { productionHouseStockTable } from "../api/v1/drizzle/schema/productionHouseStock";
import { getCurrentDate } from "../api/v1/utils/timezone";

/**
 * Reset production stock:
 * 1. Hard-delete all stock_allocation_audit rows
 * 2. Hard-delete all production_house_stock rows
 * 3. For products with Order-Shipped deliveries, insert a new production_house_stock row
 *    with totalQuantity = sum of sentQuantity
 * 4. Re-create ship allocations for each Order-Shipped delivery
 *
 * Run from project root: npx tsx src/test-scripts/reset-production-stock.ts
 */

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);

    // 1. Hard-delete all allocations
    const deletedAllocations = await db
        .delete(stockAllocationAuditTable)
        .returning({ id: stockAllocationAuditTable.id });
    console.log(`Deleted ${deletedAllocations.length} stock_allocation_audit rows.`);

    // 2. Hard-delete all production stock
    const deletedStock = await db
        .delete(productionHouseStockTable)
        .returning({ id: productionHouseStockTable.id });
    console.log(`Deleted ${deletedStock.length} production_house_stock rows.`);

    // 3. Fetch individual Order-Shipped delivery records
    const shippedDeliveries = await db
        .select({
            id: deliveryHistoryTable.id,
            productId: deliveryHistoryTable.productId,
            sentQuantity: deliveryHistoryTable.sentQuantity,
            createdBy: deliveryHistoryTable.createdBy,
        })
        .from(deliveryHistoryTable)
        .where(eq(deliveryHistoryTable.status, "Order-Shipped"));

    const validDeliveries = shippedDeliveries.filter(
        d => d.productId !== null && Number(d.sentQuantity) > 0
    );
    console.log(`Found ${shippedDeliveries.length} Order-Shipped deliveries, ${validDeliveries.length} with sentQuantity > 0.`);

    if (validDeliveries.length === 0) {
        console.log("No valid entries to insert.");
        await pool.end();
        return;
    }

    // 4. Group by productId in-memory
    const productGroups = new Map<string, {
        deliveries: typeof validDeliveries;
        totalSentQty: number;
        createdBy: string;
    }>();

    for (const d of validDeliveries) {
        const group = productGroups.get(d.productId!) || {
            deliveries: [],
            totalSentQty: 0,
            createdBy: d.createdBy,
        };
        group.deliveries.push(d);
        group.totalSentQty += Number(d.sentQuantity);
        productGroups.set(d.productId!, group);
    }

    console.log(`Grouped into ${productGroups.size} products.`);

    // 5. Insert production_house_stock rows + ship allocations per product
    const now = getCurrentDate();
    let totalInserted = 0;
    let totalAllocations = 0;

    for (const [productId, group] of productGroups) {
        const [rp] = await db
            .insert(productionHouseStockTable)
            .values({
                productId,
                totalQuantity: group.totalSentQty,
                committedQuantity: group.totalSentQty,
                note: "Reset from Order-Shipped deliveries",
                isDeleted: false,
                createdBy: group.createdBy,
                createdAt: now,
                updatedAt: now,
            })
            .returning({
                id: productionHouseStockTable.id,
                productId: productionHouseStockTable.productId,
                totalQuantity: productionHouseStockTable.totalQuantity,
                committedQuantity: productionHouseStockTable.committedQuantity,
            });

        totalInserted++;
        console.log(`  productId: ${rp.productId}, qty: ${rp.totalQuantity}, deliveries: ${group.deliveries.length}`);

        // Insert ship allocations for each individual delivery
        for (const delivery of group.deliveries) {
            await db.insert(stockAllocationAuditTable).values({
                deliveryHistoryId: delivery.id,
                stockId: rp.id,
                allocatedQuantity: Number(delivery.sentQuantity),
                allocationType: "ship",
                wasAutoCreated: false,
                autoAddedQuantity: 0,
                totalQuantityBefore: 0,
                sentQuantity: Number(delivery.sentQuantity),
                createdAt: now,
                updatedAt: now,
            });
            totalAllocations++;
        }
    }

    console.log(`Inserted ${totalInserted} production_house_stock rows and ${totalAllocations} ship allocations.`);

    await pool.end();
}

main()
    .then(() => {
        console.log("Done.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });
