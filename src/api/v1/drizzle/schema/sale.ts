// src/db/schema/sale.ts

import { pgTable, uuid, integer, numeric, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { customerCategories } from './customerCategory';
import { customers } from './customer';
import { inventoryItems } from './inventoryItem';
import { outlets } from './outet';

// Sold Records Table
export const soldRecords = pgTable('sold_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'cascade' }),
    customerCategoryId: uuid('customer_category_id').references(() => customerCategories.id, { onDelete: 'restrict' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    totalQuantity: numeric('total_quantity', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    totalPriceWithoutDiscount: numeric('total_price_without_discount', { precision: 10, scale: 2 }).notNull(),
    totalDiscount: numeric('total_discount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    totalPriceWithDiscount: numeric('total_price_with_discount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Sold Items Table
export const soldItems = pgTable('sold_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    soldRecordId: uuid('sold_record_id').references(() => soldRecords.id, { onDelete: 'cascade' }).notNull(),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'restrict' }),
    productName: varchar('product_name', { length: 255 }).notNull(),
    discount: numeric('discount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    discountType: varchar('discount_type', { length: 50 }).notNull(), // 'fixed' or 'percentage'
    price: numeric('price', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    unitSuffix: varchar('unit_suffix', { length: 50 }),
    stock: numeric('stock', { precision: 10, scale: 2, mode: 'number' }).notNull(),
});

// Sold Payment Info Table
export const soldPaymentInfo = pgTable('sold_payment_info', {
    id: uuid('id').defaultRandom().primaryKey(),
    soldRecordId: uuid('sold_record_id').references(() => soldRecords.id, { onDelete: 'cascade' }).notNull(),
    method: varchar('method', { length: 50 }).notNull(), // 'cash', 'card', etc.
    amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
});

// Export types for TypeScript usage
export type SoldRecord = typeof soldRecords.$inferSelect;
export type NewSoldRecord = typeof soldRecords.$inferInsert;
export type SoldItem = typeof soldItems.$inferSelect;
export type NewSoldItem = typeof soldItems.$inferInsert;
export type SoldPayment = typeof soldPaymentInfo.$inferSelect;
export type NewSoldPayment = typeof soldPaymentInfo.$inferInsert;