import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const unitTable = pgTable('units', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    name: varchar('name').notNull(),
    description: text().default(""),
});

export type UnitTable = typeof unitTable.$inferSelect;
export type NewUnit = typeof unitTable.$inferInsert;