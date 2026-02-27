import { boolean, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { readyProductTable } from "./readyProduct";
import { deliveryHistoryTable } from "./deliveryHistory";

export const readyProductAllocationTable = pgTable("ready_product_allocation", {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryHistoryId: uuid("delivery_history_id").references(() => deliveryHistoryTable.id).notNull(),
    readyProductId: uuid("ready_product_id").references(() => readyProductTable.id).notNull(),
    allocatedQuantityInMainUnit: numeric("allocated_quantity_in_main_unit", { mode: "number", scale: 3 }).notNull(),
    createdNewReadyProductRow: boolean("created_new_ready_product_row").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type ReadyProductAllocationTable = typeof readyProductAllocationTable.$inferSelect;
export type NewReadyProductAllocation = typeof readyProductAllocationTable.$inferInsert;
