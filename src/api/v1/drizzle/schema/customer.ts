import { numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { userTable } from "./user";
import { customerCategoryTable, discountTypeEnum } from "./customerCategory";

export const customerTable = pgTable('customer', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    categoryId: uuid('category_id').references(() => customerCategoryTable.id).default(null),
    name: varchar('name').notNull(),
    email: varchar('email').notNull().unique(),
    phone: varchar('phone').notNull().unique(),
    about: text('about').default(""),
    discountType: discountTypeEnum('discount_type').default(null),
    discountAmount: numeric('discount_amount', {mode: 'number', scale: 2}).default(null)
})

export type CustomerTable = typeof customerTable.$inferSelect;
export type NewCustomer = typeof customerTable.$inferInsert;
