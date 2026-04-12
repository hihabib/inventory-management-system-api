import { pgTable, index, jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { userTable } from './user';

export const userMetaTable = pgTable('user_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => userTable.id, { onDelete: 'cascade' }).notNull(),
  key: varchar('key', { length: 255 }).notNull(),
  value: jsonb('value').notNull().$type<any>(),
  createdAt: timestamp('created_at', {withTimezone: true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow().notNull(),
}, (table) => ({
  userKeyIdx: index('user_metadata_user_key_idx').on(table.userId, table.key),
}));

export type UserMetaTable = typeof userMetaTable.$inferSelect;
export type NewUserMeta = typeof userMetaTable.$inferInsert;
