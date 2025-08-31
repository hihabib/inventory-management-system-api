import { pgTable, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { outlets } from './outet';

export const inventoryStocks = pgTable('inventory_stocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').references(() => outlets.id),
  stocks: jsonb('stocks').notNull(), // This will store the stocks object directly
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type InventoryStock = typeof inventoryStocks.$inferSelect;
export type NewInventoryStock = typeof inventoryStocks.$inferInsert;