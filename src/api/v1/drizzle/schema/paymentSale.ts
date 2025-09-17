import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { paymentTable } from './payment';
import { saleTable } from './sale';

export const paymentSaleTable = pgTable('payment_sale', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    paymentId: integer('payment_id').references(() => paymentTable.id).notNull(),
    saleId: uuid('sale_id').references(() => saleTable.id).notNull(),
});