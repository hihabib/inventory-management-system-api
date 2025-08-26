import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username').notNull().unique(),
    password: varchar('password').notNull(),
    email: varchar('email').notNull().unique(),
    fullName: varchar('full_name').notNull(),
    role: varchar('role').notNull().default('user'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;