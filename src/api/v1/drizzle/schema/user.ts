import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    username: text('username').notNull().unique(),
    password: text('password').notNull(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    role: text('role').notNull().default('user'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript usage
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;