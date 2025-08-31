import { pgTable, uuid, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { supplyItems } from './supplyItem';
import { productionHouses } from './productionHouse';
import { units } from './unit';

export const supplyStocks = pgTable('supply_stocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplyItemId: uuid('supply_item_id').references(() => supplyItems.id, { onDelete: 'cascade' }),
  productionHouseId: uuid('production_house_id').references(() => productionHouses.id),
  unitId: uuid('unit_id').references(() => units.id),
  stock: integer('stock').notNull(),
  pricePerUnit: numeric('price_per_unit', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type SupplyStock = typeof supplyStocks.$inferSelect;
export type NewSupplyStock = typeof supplyStocks.$inferInsert;