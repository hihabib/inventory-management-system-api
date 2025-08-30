import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { units } from './unit';

export const inventoryItemUnits = pgTable('inventory_item_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type InventoryItemUnit = typeof inventoryItemUnits.$inferSelect;
export type NewInventoryItemUnit = typeof inventoryItemUnits.$inferInsert;