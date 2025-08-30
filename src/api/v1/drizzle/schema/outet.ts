import { pgTable, uuid, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './user';

export const outlets = pgTable('outlets', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name').notNull(),
    location: text('location').notNull(),
    status: varchar('status').notNull().default('active'), // 'active' or 'inactive'
    assignedTo: uuid('assigned_to').references(() => users.id).notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type Outlet = typeof outlets.$inferSelect;
export type NewOutlet = typeof outlets.$inferInsert;