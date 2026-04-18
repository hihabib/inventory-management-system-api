import { pgTable, uuid, numeric, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { productTable } from "./product";
import { userTable } from "./user";

/**
 * Production House Stock Table
 * Tracks stock available at the production house ready to be sent to outlets.
 *
 * Renamed from: ready_product
 */
export const productionHouseStockTable = pgTable("production_house_stock", {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => productTable.id).notNull(),
    totalQuantity: numeric("total_quantity", { mode: "number", scale: 3 }).notNull().default(0),
    committedQuantity: numeric("committed_quantity", { mode: "number", scale: 3 }).notNull().default(0),
    note: text("note"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdBy: uuid("created_by").references(() => userTable.id).notNull(),
    updatedBy: uuid("updated_by").references(() => userTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type ProductionHouseStockTable = typeof productionHouseStockTable.$inferSelect;
export type NewProductionHouseStock = typeof productionHouseStockTable.$inferInsert;
