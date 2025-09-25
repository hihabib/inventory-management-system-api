import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const roleTable = pgTable('roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name').notNull(),
    description: text('description').default(""),
    defaultRoute: varchar('default_route').notNull().default('/admin'),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
});

export type RoleTable = typeof roleTable.$inferSelect;
export type NewRole = typeof roleTable.$inferInsert;