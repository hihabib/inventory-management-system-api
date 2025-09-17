import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { userTable } from "./user";
import { customerCategoryTable } from "./customerCategory";

export const customerTable = pgTable('customer', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    categoryId: uuid('category_id').references(() => customerCategoryTable.id).default(null),
    name: varchar('name').notNull(),
    email: varchar('email').notNull(),
    phone: varchar('phone').notNull(),
    about: text('about').default(""),
})

export type CustomerTable = typeof customerTable.$inferSelect;
export type NewCustomer = typeof customerTable.$inferInsert;
