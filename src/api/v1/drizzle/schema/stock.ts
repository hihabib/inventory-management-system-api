import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { productTable } from "./product";
import { unitTable } from "./unit";

export const stockTable = pgTable("stock", {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    unitId: uuid('unit_id').references(() => unitTable.id).notNull(),
    productId: uuid('product_id').references(() => productTable.id).notNull(),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    pricePerQuantity: numeric('price_per_quantity', { mode: 'number', scale: 2}).notNull(),
    quantity: numeric('quantity', { mode: 'number', scale: 3 }).notNull()
})

export type StockTable = typeof stockTable.$inferSelect;
export type NewStock = typeof stockTable.$inferInsert;