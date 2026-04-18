import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productionHouseStockTable } from "./productionHouseStock";
import { deliveryHistoryTable } from "./deliveryHistory";

/**
 * Stock Allocation Audit Table
 * Audit trail for all quantity changes to production house stock.
 *
 * Renamed from: ready_product_allocation
 */
export const stockAllocationAuditTable = pgTable("stock_allocation_audit", {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryHistoryId: uuid("delivery_history_id").references(() => deliveryHistoryTable.id).notNull(),
    stockId: uuid("stock_id").references(() => productionHouseStockTable.id, { onDelete: "cascade" }).notNull(),
    allocatedQuantity: numeric("allocated_quantity", { mode: "number", scale: 3 }).notNull(),
    allocationType: text("allocation_type").notNull().default("ship"),
    // Types: ship | complete | cancel | return | manual_add | auto_add | manual_edit
    wasAutoCreated: boolean("was_auto_created").notNull().default(false),
    autoAddedQuantity: numeric("auto_added_quantity", { mode: "number", scale: 3 }).default(0),
    totalQuantityBefore: numeric("total_quantity_before", { mode: "number", scale: 3 }).notNull().default(0),
    sentQuantity: numeric("sent_quantity", { mode: "number", scale: 3 }).default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type StockAllocationAuditTable = typeof stockAllocationAuditTable.$inferSelect;
export type NewStockAllocationAudit = typeof stockAllocationAuditTable.$inferInsert;
