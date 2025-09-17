import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { productCategoryTable } from "./productCategory";
import { productTable } from "./product";

export const productCategoryInProductTable = pgTable("product_category_in_product", {
    productCategoryId: uuid('product_category_id').references(() => productCategoryTable.id, {onDelete: 'cascade'}).notNull(),
    productId: uuid("product_id").references(() => productTable.id, {onDelete: 'cascade'}).notNull()
}, (table) => [
    primaryKey({name: "product_category_in_product_pk", columns: [table.productCategoryId, table.productId] })
])

export type ProductCategoryInProductTable = typeof productCategoryInProductTable.$inferSelect;
export type NewProductCategoryInProduct = typeof productCategoryInProductTable.$inferInsert;