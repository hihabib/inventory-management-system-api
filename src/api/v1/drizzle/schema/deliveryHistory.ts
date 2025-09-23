import { numeric, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { productTable } from "./product";
import { unitTable } from "./unit";
import { userTable } from "./user";

export const DeliveryStatus = pgEnum("delivery_status", [
    "Order-Placed",
    "Order-Shipped",
    "Order-Completed",
    "Order-Cancelled",
    "Return-Placed",
    "Return-Completed",
    "Return-Cancelled"
])
export const deliveryHistoryTable = pgTable("delivery_history", {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    status: DeliveryStatus('status').default("Order-Shipped"),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    unitId: uuid('unit_id').references(() => unitTable.id).notNull(),
    productId: uuid('product_id').references(() => productTable.id).notNull(),
    pricePerQuantity: numeric('price_per_quantity', { mode: 'number', scale: 2 }).notNull(),
    sentQuantity: numeric('sent_quantity', { mode: 'number', scale: 3 }).notNull(),
    receivedQuantity: numeric('received_quantity', { mode: 'number', scale: 3 }).notNull(),
    orderedQuantity: numeric('ordered_quantity', { mode: 'number', scale: 3 }).notNull()
})

export type DeliveryHistoryTable = typeof deliveryHistoryTable.$inferSelect;
export type NewDeliveryHistory = typeof deliveryHistoryTable.$inferInsert;
