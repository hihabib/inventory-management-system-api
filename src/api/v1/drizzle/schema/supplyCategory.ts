import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';

export const supplyCategories = pgTable('supply_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryName: varchar('category_name', { length: 255 }).notNull().unique(),
  categorySlug: varchar('category_slug', { length: 255 }).notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type SupplyCategory = typeof supplyCategories.$inferSelect;
export type NewSupplyCategory = typeof supplyCategories.$inferInsert;