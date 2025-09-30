import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintainsTable } from "./maintains";
import { productTable } from "./product";
import { unitTable } from "./unit";

export const relatedStockTable = pgTable("related_stock", {
    
})

export type RelatedStockTable = typeof relatedStockTable.$inferSelect;
export type NewRelatedStock = typeof relatedStockTable.$inferInsert;
