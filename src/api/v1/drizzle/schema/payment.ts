import { jsonb, numeric, pgTable, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { saleTable } from "./sale";
import { userTable } from "./user";
import { customerDueTable } from "./customerDue";

export type PaymentMethod = "Bkash" | "Nogod" | "Cash" | "Due" | "Card"

export const paymentTable = pgTable('payment', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    payments: jsonb().$type<Record<keyof PaymentMethod, number>>().notNull(),
    totalAmount: numeric('total_amount', { mode: 'number', scale: 2 }).notNull(),
    customerDueId: uuid('customer_due_id').references(() => customerDueTable.id).default(null),
})

export type PaymentTable = typeof paymentTable.$inferSelect;
export type NewPayment = typeof paymentTable.$inferInsert;