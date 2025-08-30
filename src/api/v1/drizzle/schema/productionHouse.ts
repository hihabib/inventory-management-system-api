import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';

export const productionHouses = pgTable('production_house', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  location: varchar('location', { length: 500 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  assignedTo: uuid('assigned_to').references(() => users.id).notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type ProductionHouse = typeof productionHouses.$inferSelect;
export type NewProductionHouse = typeof productionHouses.$inferInsert;