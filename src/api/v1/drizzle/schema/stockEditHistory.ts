import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { productionHouseStockTable } from "./productionHouseStock";
import { userTable } from "./user";

/**
 * Stock Edit History Table
 * Full audit trail for manual edits to production house stock records.
 * Tracks who changed what, when, and the before/after values.
 */
export const stockEditHistoryTable = pgTable("stock_edit_history", {
    id: uuid("id").defaultRandom().primaryKey(),
    stockId: uuid("stock_id").references(() => productionHouseStockTable.id, { onDelete: "cascade" }).notNull(),
    editedBy: uuid("edited_by").references(() => userTable.id).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
    fieldChanged: text("field_changed").notNull(), // 'totalQuantity' | 'note'
    oldValue: text("old_value"),
    newValue: text("new_value"),
    oldNumeric: numeric("old_numeric", { mode: "number", scale: 3 }),
    newNumeric: numeric("new_numeric", { mode: "number", scale: 3 }),
    changeReason: text("change_reason"),
});

export type StockEditHistoryTable = typeof stockEditHistoryTable.$inferSelect;
export type NewStockEditHistory = typeof stockEditHistoryTable.$inferInsert;
