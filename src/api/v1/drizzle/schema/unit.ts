import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user';

export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  unitLabel: varchar('unit_label').notNull().unique(),
  unitSuffix: varchar('unit_suffix').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;