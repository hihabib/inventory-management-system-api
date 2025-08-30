import { pgTable, uuid, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { units } from './unit';
import { outlets } from './outet';

export const inventoryStocks = pgTable('inventory_stocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').references(() => outlets.id),
  unitId: uuid('unit_id').references(() => units.id),
  stock: integer('stock').notNull().default(0),
  pricePerUnit: numeric('price_per_unit', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type InventoryStock = typeof inventoryStocks.$inferSelect;
export type NewInventoryStock = typeof inventoryStocks.$inferInsert;