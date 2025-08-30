import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { inventoryItems } from './inventoryItem';
import { productCategories } from './productCategory';

export const inventoryItemCategories = pgTable('inventory_item_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => productCategories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type InventoryItemCategory = typeof inventoryItemCategories.$inferSelect;
export type NewInventoryItemCategory = typeof inventoryItemCategories.$inferInsert;