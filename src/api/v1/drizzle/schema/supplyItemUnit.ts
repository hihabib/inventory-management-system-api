import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { supplyItems } from './supplyItem';
import { units } from './unit';

export const supplyItemUnits = pgTable('supply_item_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplyItemId: uuid('supply_item_id').references(() => supplyItems.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type SupplyItemUnit = typeof supplyItemUnits.$inferSelect;
export type NewSupplyItemUnit = typeof supplyItemUnits.$inferInsert;