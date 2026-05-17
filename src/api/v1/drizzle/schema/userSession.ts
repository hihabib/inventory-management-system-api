import { pgTable, timestamp, uuid, varchar, text, index } from 'drizzle-orm/pg-core';
import { userTable } from './user';

// Represents a single authenticated session (one device / browser).
// The JWT carries this session's id so we can revoke it server-side
// independently of the JWT signature.
export const userSessionTable = pgTable('user_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => userTable.id, { onDelete: 'cascade' }).notNull(),
    // Free-form description of the client (User-Agent header or a custom
    // device label). Kept human-readable for the admin sessions panel.
    userAgent: text('user_agent').default(''),
    // Best-effort capture of the client IP at sign-in time.
    ipAddress: varchar('ip_address', { length: 64 }).default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Bumped on every successful authenticated request — used as
    // "last active" on the admin sessions panel.
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    // When set, the session is considered revoked and the JWT carrying its
    // id is rejected. Soft-revocation lets us keep audit history.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
    userIdx: index('user_sessions_user_id_idx').on(table.userId),
}));

export type UserSessionTable = typeof userSessionTable.$inferSelect;
export type NewUserSession = typeof userSessionTable.$inferInsert;
