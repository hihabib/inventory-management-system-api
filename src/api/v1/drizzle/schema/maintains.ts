import { pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const maintainsTypeEnum = pgEnum("maintains_type", [
    'Outlet',
    'Production'
])
export const maintainsTable = pgTable('maintains', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    name: varchar('name').notNull(),
    description: text('description').default(""),
    type: maintainsTypeEnum('type').notNull().default('Outlet')
});

export type MaintainsTable = typeof maintainsTable.$inferSelect;
export type NewMaintains = typeof maintainsTable.$inferInsert;