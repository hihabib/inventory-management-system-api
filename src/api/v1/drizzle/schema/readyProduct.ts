import { pgTable, uuid, numeric, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { productTable } from "./product";
import { userTable } from "./user";

export const readyProductTable = pgTable("ready_product", {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => productTable.id).notNull(),
    quantityInMainUnit: numeric("quantity_in_main_unit", { mode: "number", scale: 3 }).notNull(),
    probableRemainingQuantity: numeric("probable_remaining_quantity", { mode: "number", scale: 3 }).notNull(),
    note: text("note"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdBy: uuid("created_by").references(() => userTable.id).notNull(),
    updatedBy: uuid("updated_by").references(() => userTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type ReadyProductTable = typeof readyProductTable.$inferSelect;
export type NewReadyProduct = typeof readyProductTable.$inferInsert;

