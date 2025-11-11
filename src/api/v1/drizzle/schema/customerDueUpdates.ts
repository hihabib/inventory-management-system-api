import { pgTable, integer, timestamp, uuid, numeric } from 'drizzle-orm/pg-core';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { userTable } from './user';
import { customerDueTable } from './customerDue';

export const customerDueUpdatesTable = pgTable('customer_due_updates', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  customerDueId: uuid('customer_due_id').references(() => customerDueTable.id).notNull(),
  updatedBy: uuid('updated_by').references(() => userTable.id).notNull(),
  totalAmount: numeric('total_amount', { mode: 'number', scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { mode: 'number', scale: 2 }).notNull(),
  collectedAmount: numeric('collected_amount', { mode: 'number', scale: 2 }).notNull(),
});

export type NewCustomerDueUpdate = InferInsertModel<typeof customerDueUpdatesTable>;
export type CustomerDueUpdate = InferSelectModel<typeof customerDueUpdatesTable>;