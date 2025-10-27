import { integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
    "Return-Cancelled",
    "Reset-Requested",
    "Reset-Completed"
])
export const deliveryHistoryTable = pgTable("delivery_history", {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    status: DeliveryStatus('status').default("Order-Shipped"),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    unitId: uuid('unit_id').references(() => unitTable.id).notNull(),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'set null' }),
    pricePerQuantity: numeric('price_per_quantity', { mode: 'number', scale: 2 }).notNull(),
    sentQuantity: numeric('sent_quantity', { mode: 'number', scale: 3 }).notNull(),
    receivedQuantity: numeric('received_quantity', { mode: 'number', scale: 3 }).notNull(),
    orderedQuantity: numeric('ordered_quantity', { mode: 'number', scale: 3 }).notNull(),
    orderedUnit: varchar("ordered_unit").default(""),
    orderNote: text("order_note").default(""),
    neededAt: timestamp('needed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    latestUnitPriceData: jsonb('latest_unit_price_data').$type<Array<{ unitId: string; pricePerQuantity: number }>>().default([]).notNull(),
})

export type DeliveryHistoryTable = typeof deliveryHistoryTable.$inferSelect;
export type NewDeliveryHistory = typeof deliveryHistoryTable.$inferInsert;
