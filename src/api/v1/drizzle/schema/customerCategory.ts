import { numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { userTable } from './user';

export const discountTypeEnum = pgEnum("discount_type", [
    'Fixed',
    'Percentage'
])

export const customerCategoryTable = pgTable('customer_category', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    categoryName: varchar('name').notNull(),
    discountType: discountTypeEnum('discount_type').notNull().default("Fixed"),
    discountAmount: numeric('discount_amount', {mode: 'number', scale: 2}).default(0).notNull()
});

export type CustomerCategoryTable = typeof customerCategoryTable.$inferSelect;
export type NewCustomerCategory = typeof customerCategoryTable.$inferInsert;