import { pgTable, text, timestamp, uuid, numeric, jsonb, index, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { accounts } from './accounts';
import { instruments } from './instruments';

export const holdings = pgTable(
  'holdings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Denormalized user reference for strict multi-tenant authorization
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    // Units/shares owned. Supports up to 4 decimal places for mutual funds / fractional gold
    units: numeric('units', { precision: 18, scale: 4 }).notNull(),
    // Average purchase price per unit in INR. Nullable when imported without cost-basis history.
    averageAcquisitionCost: numeric('average_acquisition_cost', { precision: 14, scale: 2 }),
    firstPurchasedAt: timestamp('first_purchased_at', { withTimezone: true }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('holdings_user_id_idx').on(table.userId),
    index('holdings_account_id_idx').on(table.accountId),
    index('holdings_instrument_id_idx').on(table.instrumentId),
    uniqueIndex('holdings_user_account_instrument_idx').on(
      table.userId,
      table.accountId,
      table.instrumentId
    ),
    // Enforces relational consistency: holding cannot reference an account owned by a different user
    foreignKey({
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
      name: 'holdings_account_user_fk',
    }).onDelete('cascade'),
  ]
);

export const holdingsRelations = relations(holdings, ({ one }) => ({
  user: one(users, {
    fields: [holdings.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [holdings.accountId],
    references: [accounts.id],
  }),
  instrument: one(instruments, {
    fields: [holdings.instrumentId],
    references: [instruments.id],
  }),
}));

export type HoldingEntity = typeof holdings.$inferSelect;
export type NewHoldingEntity = typeof holdings.$inferInsert;
