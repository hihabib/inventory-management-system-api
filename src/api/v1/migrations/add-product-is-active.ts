import { db } from "../drizzle/db";
import { sql } from "drizzle-orm";
/**
 * Migration: Add is_active column to product with default true and not null.
 * - Column will be used for frontend active/inactive display only.
 * - Products remain visible in listings regardless of is_active.
 */
export async function addProductIsActiveColumn() {
  console.log("🚀 Starting migration: add is_active to product");
  try {
    await db.execute(sql`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "is_active" boolean;`);
    await db.execute(sql`UPDATE "product" SET "is_active" = true WHERE "is_active" IS NULL;`);
    await db.execute(sql`ALTER TABLE "product" ALTER COLUMN "is_active" SET DEFAULT true;`);
    await db.execute(sql`ALTER TABLE "product" ALTER COLUMN "is_active" SET NOT NULL;`);
    console.log("✅ Migration completed: is_active column added/ensured");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

if (require.main === module) {
  addProductIsActiveColumn()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}
