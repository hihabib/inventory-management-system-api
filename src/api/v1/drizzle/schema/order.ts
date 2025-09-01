// src/db/schema/order.ts

import { pgTable, uuid, numeric, varchar, timestamp, text } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { outlets } from './outet';

export const orders = pgTable('orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id').references(() => inventoryItems.id, { onDelete: 'cascade' }).notNull(),
    outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'cascade' }).notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'), // e.g., 'pending', 'shipped', 'delivered', 'cancelled'
    orderNote: text('order_note'), // Optional order note
    neededBy: timestamp('needed_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;