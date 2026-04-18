import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./user";

/**
 * Stock Configuration Table
 * Key-value configuration store controlling stock system behavior.
 *
 * Renamed from: ready_product_config
 */
export const stockConfigTable = pgTable("stock_config", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
    description: text("description"),
    updatedBy: uuid("updated_by").references(() => userTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type StockConfigTable = typeof stockConfigTable.$inferSelect;
export type NewStockConfig = typeof stockConfigTable.$inferInsert;
