import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { supplyItems } from './supplyItem';
import { supplyCategories } from './supplyCategory';

export const supplyItemCategories = pgTable('supply_item_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplyItemId: uuid('supply_item_id').references(() => supplyItems.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => supplyCategories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type SupplyItemCategory = typeof supplyItemCategories.$inferSelect;
export type NewSupplyItemCategory = typeof supplyItemCategories.$inferInsert;