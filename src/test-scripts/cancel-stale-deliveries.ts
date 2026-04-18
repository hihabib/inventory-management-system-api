import "dotenv/config";
import { and, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { deliveryHistoryTable } from "../api/v1/drizzle/schema/deliveryHistory";

/**
 * Manual migration: Cancel stale delivery history records.
 *
 * Updates all delivery_history rows created before 12 April 2026 4:00 AM BDT (UTC+6)
 * that have status "Order-Shipped" or "Order-Placed" to "Order-Cancelled".
 *
 * Run from project root: npx tsx src/test-scripts/cancel-stale-deliveries.ts
 */

const CUTOFF_BDT = "2026-04-12T04:00:00+06:00"; // 12 April 2026 4:00 AM BDT

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);

    console.log(`Cancelling deliveries created before ${CUTOFF_BDT} (BDT)...`);

    // Count affected rows first
    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveryHistoryTable)
        .where(
            and(
                inArray(deliveryHistoryTable.status, ["Order-Shipped", "Order-Placed"]),
                lte(deliveryHistoryTable.createdAt, new Date(CUTOFF_BDT))
            )
        );

    const count = Number(countResult.count);
    console.log(`Found ${count} rows to update.`);

    if (count === 0) {
        console.log("No rows to update. Exiting.");
        await pool.end();
        return;
    }

    // Perform the update
    const result = await db
        .update(deliveryHistoryTable)
        .set({
            status: "Order-Cancelled",
            cancelledAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(deliveryHistoryTable.status, ["Order-Shipped", "Order-Placed"]),
                lte(deliveryHistoryTable.createdAt, new Date(CUTOFF_BDT))
            )
        )
        .returning({ id: deliveryHistoryTable.id });

    console.log(`Updated ${result.length} rows to Order-Cancelled.`);
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
