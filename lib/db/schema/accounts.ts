import { pgTable, text, timestamp, uuid, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { holdings } from './holdings';
import { transactions } from './transactions';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Account type: 'brokerage' | 'bank' | 'demat' | 'epf' | 'ppf' | 'nps' | 'manual'
    accountType: text('account_type').notNull(),
    // Institution name: e.g. 'Zerodha', 'HDFC Bank', 'Groww', 'CAMS'
    institutionName: text('institution_name').notNull(),
    // Display identifier, strictly masked (e.g. '••••4812'). Never store raw account numbers.
    accountIdentifierMasked: text('account_identifier_masked'),
    // Connection status: 'active' | 'needs_reauth' | 'manual' | 'disconnected'
    connectionStatus: text('connection_status').notNull().default('manual'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // Non-sensitive metadata (e.g. aggregator consent ID, broker client tag)
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.userId),
    unique('accounts_id_user_id_unique').on(table.id, table.userId),
  ]
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  holdings: many(holdings),
  transactions: many(transactions),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
