import { pgTable, text, timestamp, uuid, numeric, index, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { accounts } from './accounts';
import { instruments } from './instruments';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    // Transaction type: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'SPLIT' | 'BONUS' | 'TRANSFER_IN' | 'TRANSFER_OUT'
    transactionType: text('transaction_type').notNull(),
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    // Quantity traded (nullable for cash dividends or interest payments)
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    // Execution price per unit
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
    // Total order value before statutory deductions and brokerage
    grossAmount: numeric('gross_amount', { precision: 14, scale: 2 }).notNull(),
    // Indian statutory charges and broker commissions
    brokerageFee: numeric('brokerage_fee', { precision: 14, scale: 2 }).default('0'),
    stt: numeric('stt', { precision: 14, scale: 2 }).default('0'), // Securities Transaction Tax
    stampDuty: numeric('stamp_duty', { precision: 14, scale: 2 }).default('0'),
    gst: numeric('gst', { precision: 14, scale: 2 }).default('0'),
    otherCharges: numeric('other_charges', { precision: 14, scale: 2 }).default('0'),
    // Net cash flow: grossAmount +/- total charges
    netAmount: numeric('net_amount', { precision: 14, scale: 2 }).notNull(),
    // External identifiers for statement reconciliation and duplicate prevention
    externalOrderId: text('external_order_id'),
    externalTradeId: text('external_trade_id'),
    // Status: 'COMPLETED' | 'CANCELLED' | 'REVERSED'
    status: text('status').notNull().default('COMPLETED'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('transactions_user_id_idx').on(table.userId),
    index('transactions_account_id_idx').on(table.accountId),
    index('transactions_instrument_id_idx').on(table.instrumentId),
    index('transactions_date_idx').on(table.transactionDate),
    index('transactions_external_order_idx').on(table.externalOrderId),
    // Enforces relational consistency: transaction cannot reference an account owned by a different user
    foreignKey({
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
      name: 'transactions_account_user_fk',
    }).onDelete('cascade'),
  ]
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  instrument: one(instruments, {
    fields: [transactions.instrumentId],
    references: [instruments.id],
  }),
}));

export type TransactionEntity = typeof transactions.$inferSelect;
export type NewTransactionEntity = typeof transactions.$inferInsert;
