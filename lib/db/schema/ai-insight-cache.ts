import { pgTable, text, timestamp, uuid, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const aiInsightCache = pgTable(
  'ai_insight_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    cacheKey: text('cache_key').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('ai_insight_cache_user_kind_key_unique').on(table.userId, table.kind, table.cacheKey)]
);

export type AiInsightCacheRow = typeof aiInsightCache.$inferSelect;
