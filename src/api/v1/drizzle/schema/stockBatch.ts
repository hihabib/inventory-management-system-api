import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { productTable } from './product';
import { maintainsTable } from './maintains';

import { userTable } from './user';
export const stockBatchTable = pgTable('stock_batch', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'set null' }),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    batchNumber: varchar('batch_number').notNull(),
    productionDate: timestamp('production_date', {withTimezone: true}).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id),
    deleted: boolean('deleted').default(false).notNull(),
});

export type StockBatchTable = typeof stockBatchTable.$inferSelect;
export type NewStockBatch = typeof stockBatchTable.$inferInsert;
