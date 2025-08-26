import { pgTable, uuid, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { customerCategories } from './customerCategory';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name').notNull(),
  email: varchar('email').notNull().unique(),
  phone: text('phone'),
  categoryId: uuid('category_id').references(() => customerCategories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;