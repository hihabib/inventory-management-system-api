import { numeric, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { userTable } from './user';
import { maintainsTable } from './maintains';

export const cashSendingTable = pgTable('cash_sending', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  userId: uuid('user_id').references(() => userTable.id).notNull(),
  maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  note: text('note').default(''),
  cashAmount: numeric('cash_amount', { mode: 'number', scale: 2 }).notNull(),
  sendingTime: timestamp('sending_time', { withTimezone: true }).notNull(),
  cashOf: timestamp('cash_of', { withTimezone: true }).notNull(),
  cashSendingBy: text('cash_sending_by').default('By Bank').notNull(),
});

export type CashSendingTable = typeof cashSendingTable.$inferSelect;
export type NewCashSending = typeof cashSendingTable.$inferInsert;