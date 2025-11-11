import { jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar, numeric } from 'drizzle-orm/pg-core';

export const maintainsTypeEnum = pgEnum("maintains_type", [
    'Outlet',
    'Production'
])
export const maintainsTable = pgTable('maintains', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
    name: varchar('name').notNull(),
    description: text('description').default(""),
    type: maintainsTypeEnum('type').notNull().default('Outlet'),
    location: text('location').default(""),
    phone: jsonb('phone').$type<number[]>().default([]),
    stockCash: numeric('stock_cash', { mode: 'number', scale: 2 }).notNull().default(0),
});

export type MaintainsTable = typeof maintainsTable.$inferSelect;
export type NewMaintains = typeof maintainsTable.$inferInsert;