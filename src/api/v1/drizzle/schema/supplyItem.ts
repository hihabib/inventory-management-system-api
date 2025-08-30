import { pgTable, uuid, varchar, numeric, integer, bigint, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { units } from './unit';

export const supplyItems = pgTable('supply_item', {
  id: uuid('id').defaultRandom().primaryKey(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  image: varchar('image', { length: 500 }),
  supplierName: varchar('supplier_name', { length: 255 }),
  lowStockThreshold: integer('low_stock_threshold').default(0),
  mainUnitId: uuid('main_unit_id').references(() => units.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type SupplyItem = typeof supplyItems.$inferSelect;
export type NewSupplyItem = typeof supplyItems.$inferInsert;