import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { units } from './unit';
import { users } from './user';

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  productNameBengali: varchar('product_name_bengali', { length: 255 }).default(''),
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
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;