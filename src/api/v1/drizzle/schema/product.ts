import { numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { userTable } from './user';
import { unitTable } from './unit';

export const productTable = pgTable('product', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    name: varchar().notNull(),
    bengaliName: varchar().notNull(),
    lowStockThreshold: numeric('low_stock_thres_hold', {mode: 'number', scale: 2}).notNull().default(5),
    sku: varchar().default("").unique(),
    mainUnitId: uuid('main_unit_id').references(() => unitTable.id)
});

export type ProductTable = typeof productTable.$inferSelect;
export type NewProduct = typeof productTable.$inferInsert;