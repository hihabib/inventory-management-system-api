import { decimal, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userTable } from './user';
import { maintainsTable } from './maintains';

export const expenseTable = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => userTable.id).notNull(),
  maintainsId: uuid('maintains_id').references(() => maintainsTable.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ExpenseTable = typeof expenseTable.$inferSelect;
export type NewExpense = typeof expenseTable.$inferInsert;