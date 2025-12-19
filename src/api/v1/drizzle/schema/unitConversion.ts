import { numeric, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { productTable } from './product';
import { unitTable } from './unit';

export const unitConversionTable = pgTable('unit_conversion', {
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'no action' }).notNull(),
    unitId: uuid('unit_id').references(() => unitTable.id, { onDelete: 'cascade' }).notNull(),
    conversionFactor: numeric('conversion_factor', { mode: 'number', scale: 6 }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.productId, table.unitId] })
]);

export type UnitConversionTable = typeof unitConversionTable.$inferSelect;
export type NewUnitConversion = typeof unitConversionTable.$inferInsert;