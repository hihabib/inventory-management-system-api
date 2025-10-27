import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { unitTable } from "./unit";
import { productTable } from "./product";

export const unitInProductTable = pgTable("unit_in_product", {
    unitId: uuid('unit_id').references(() => unitTable.id, { onDelete: 'cascade' }).notNull(),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'no action' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.productId, table.unitId] })
])

export type UnitInProductTable = typeof unitInProductTable.$inferSelect;
export type NewUnitInProduct = typeof unitInProductTable.$inferInsert;

