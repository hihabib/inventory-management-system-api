import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { userTable } from "./user";
import { customerTable } from "./customer";
import { maintainsTable } from "./maintains";

export const customerDueTable = pgTable('customer_due', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    customerId: uuid('customer_id').references(() => customerTable.id).notNull(),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    totalAmount: numeric('total_amount', { mode: 'number', scale: 2 }).notNull(),
    paidAmount: numeric('paid_amount', { mode: 'number', scale: 2 }).notNull(),
})

export type CustomerDueTable = typeof customerDueTable.$inferSelect;
export type NewCustomerDue = typeof customerDueTable.$inferInsert;