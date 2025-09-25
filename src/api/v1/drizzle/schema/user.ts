import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { roleTable } from './role';
import { maintainsTable } from './maintains';

export const userTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username').notNull().unique(),
  password: varchar('password').notNull(),
  email: varchar('email').notNull().unique(),
  fullName: varchar('full_name').notNull(),
  roleId: uuid('role_id').references(() => roleTable.id).notNull(),
  maintainsId: uuid('maintains_id').references(() => maintainsTable.id),
  createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
});

export type UserTable = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;