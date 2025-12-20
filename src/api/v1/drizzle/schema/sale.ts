import { numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { userTable } from "./user";
import { maintainsTable } from "./maintains";
import { customerCategoryTable, discountTypeEnum } from "./customerCategory";
import { customerTable } from "./customer";
import { productTable } from "./product";
import { stockBatchTable } from "./stockBatch";
import { unitTable } from "./unit";

export const saleTable = pgTable('sale', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => userTable.id).notNull(),
    maintainsId: uuid('maintains_id').references(() => maintainsTable.id).notNull(),
    customerCategoryId: uuid('customer_category_id').references(() => customerCategoryTable.id).default(null),
    customerId: uuid('customer_id').references(() => customerTable.id).default(null),
    productId: uuid('product_id').references(() => productTable.id, { onDelete: 'set null' }),
    productName: varchar('product_name').notNull(),
    discountType: discountTypeEnum('discount_type').default('Fixed').notNull(),
    discountAmount: numeric('discount_amount', {mode: 'number', scale: 2}).default(0).notNull(),
    discountNote: text('discount_note').default(""),
    saleQuantity: numeric('sale_quantity', { mode: 'number', scale: 3 }).notNull(),
    saleAmount: numeric('sale_amount', { mode: 'number', scale: 2 }).notNull(),
    pricePerUnit: numeric('price_per_unit', { mode: 'number', scale: 2 }).notNull(),
    unit: varchar('unit', { length: 20 }).notNull(),
    saleUnitId: uuid('sale_unit_id').references(() => unitTable.id).default(null),
    stockBatchId: uuid('stock_batch_id').references(() => stockBatchTable.id).default(null),
    quantityInMainUnit: numeric('quantity_in_main_unit', { mode: 'number', scale: 3 }),
    mainUnitPrice: numeric('main_unit_price', { mode: 'number', scale: 2 }),
})

export type SaleTable = typeof saleTable.$inferSelect;
export type NewSale = typeof saleTable.$inferInsert;
