import { pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userTable } from './user';

export const transactionTypeEnum = pgEnum("transaction_type", [
    "Order",
    "Return"
])

export const transactionStatusEnum = pgEnum("transaction_status", [
    "Pending",
    "Canceled",
    "Received",
    "Shipped"
])

export const innerTransactionTable = pgTable('inner_transaction', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    transactionType: transactionTypeEnum('transaction_type').default("Order").notNull(),
    status: transactionStatusEnum('status').notNull().default("Pending")
});

export type InnerTransactionTable = typeof innerTransactionTable.$inferSelect;
export type NewInnerTransaction = typeof innerTransactionTable.$inferInsert;