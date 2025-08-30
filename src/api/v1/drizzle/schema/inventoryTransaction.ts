import { pgTable, uuid, varchar, integer, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { units } from './unit';
import { users } from './user';
import { outlets } from './outet';

export const inventoryTransactions = pgTable('inventory_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'cascade' }),
    outletId: uuid('outlet_id').references(() => outlets.id),
    orderedUnitId: uuid('ordered_unit_id').references(() => units.id),
    transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'order' or 'return'
    status: varchar('status', { length: 50 }).notNull(),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
    orderedAt: timestamp('ordered_at'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type NewInventoryTransaction = typeof inventoryTransactions.$inferInsert;