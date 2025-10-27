import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { productTable } from "./product";
import { unitTable } from "./unit";
import { stockBatchTable } from "./stockBatch";

export const stockTable = pgTable("stock", {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
    unitId: uuid('unit_id').references(() => unitTable.id).notNull(),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'set null' }),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    stockBatchId: uuid('stock_batch_id').references(() => stockBatchTable.id),
    pricePerQuantity: numeric('price_per_quantity', { mode: 'number', scale: 2}).notNull(),
    quantity: numeric('quantity', { mode: 'number', scale: 3 }).notNull()
})

export type StockTable = typeof stockTable.$inferSelect;
export type NewStock = typeof stockTable.$inferInsert;