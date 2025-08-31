import { boolean, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const customerCategories = pgTable('customer_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryName: varchar('category_name').notNull().unique(),
  categorySlug: varchar('category_slug').notNull().unique(),
  discount: numeric('discount', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
  discountType: varchar('discount_type').notNull().default('fixed'), // 'fixed' or 'percentage'
  isDefault: boolean('is_default').notNull().default(false), 
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type CustomerCategory = typeof customerCategories.$inferSelect;
export type NewCustomerCategory = typeof customerCategories.$inferInsert;