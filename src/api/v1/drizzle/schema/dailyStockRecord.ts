import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { unitTable } from "./unit";
import { productTable } from "./product";

export const dailyStockRecordTable = pgTable("daily_stock_record", {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    unitId: uuid('unit_id').references(() => unitTable.id).notNull(),
    quantity: numeric('quantity', { mode: 'number', scale: 3 }).notNull(),
    pricePerQuantity: numeric('price_per_quantity', { mode: 'number', scale: 2}).notNull(),
    productId: uuid('product_id').references(() => productTable.id).notNull(),
});

export type DailyStockRecordTable = typeof dailyStockRecordTable.$inferSelect;
export type NewDailyStockRecord = typeof dailyStockRecordTable.$inferInsert;