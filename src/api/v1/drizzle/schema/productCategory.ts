import { boolean, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const productCategoryTable = pgTable("product_category", {
    id: uuid().defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", {withTimezone: true}).defaultNow().notNull(),
    name: varchar().notNull(),
    description: text(),
    parentId: uuid('parent_id').references(() => productCategoryTable.id).default(null),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    vat: numeric('vat', { scale: 2, mode: 'number' }).default(null),
})

export type ProductCategoryTable = typeof productCategoryTable.$inferSelect;
export type NewProductCategory = typeof productCategoryTable.$inferInsert;