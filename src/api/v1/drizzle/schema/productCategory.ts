import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';

export const productCategories = pgTable('product_category', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryName: varchar('category_name', { length: 255 }).notNull().unique(),
  categorySlug: varchar('category_slug', { length: 255 }).notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type ProductCategory = typeof productCategories.$inferSelect;
export type NewProductCategory = typeof productCategories.$inferInsert;