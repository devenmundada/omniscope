import { pgTable, text, timestamp, uuid, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { holdings } from './holdings';
import { transactions } from './transactions';
import { marketPrices } from './market-prices';

export const instruments = pgTable(
  'instruments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // International Securities Identification Number (12 characters, e.g. INE002A01018)
    isin: varchar('isin', { length: 12 }),
    // Primary trading ticker or fund code (e.g. 'RELIANCE', 'PPFAS-FC', 'NIFTYBEES')
    symbol: text('symbol').notNull(),
    // Full legal/commercial instrument name
    name: text('name').notNull(),
    // Asset class: 'Indian Stocks' | 'Mutual Funds' | 'ETFs' | 'Gold' | 'Fixed Income' | 'REITs' | 'InvITs' | 'International' | 'Cash'
    assetClass: text('asset_class').notNull(),
    // Market sector (e.g. 'Energy', 'Financials', 'Information Technology', 'Debt')
    sector: text('sector'),
    // Primary exchange or registry: 'NSE' | 'BSE' | 'AMFI' | 'RBI' | 'OTHER'
    exchange: text('exchange').default('NSE'),
    // AMFI scheme code for automated mutual fund daily NAV sync
    amfiCode: text('amfi_code'),
    // Market cap category: 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Multi Cap' | null
    marketCapCategory: text('market_cap_category'),
    // Currency of denomination
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    // Extensible instrument metadata (expense ratio, underlying holdings for look-through, face value, coupon rate, etc.)
    metadata: jsonb('metadata').$type<{
      expenseRatio?: number;
      faceValue?: number;
      couponRate?: number;
      maturityDate?: string;
      fundManager?: string;
      benchmarkIndex?: string;
      lookThroughHoldings?: Array<{
        company: string;
        weight: number;
        sector?: string;
      }>;
    }>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('instruments_isin_idx').on(table.isin),
    index('instruments_symbol_exchange_idx').on(table.symbol, table.exchange),
    index('instruments_asset_class_idx').on(table.assetClass),
    index('instruments_amfi_code_idx').on(table.amfiCode),
  ]
);

export const instrumentsRelations = relations(instruments, ({ many }) => ({
  holdings: many(holdings),
  transactions: many(transactions),
  marketPrices: many(marketPrices),
}));

export type Instrument = typeof instruments.$inferSelect;
export type NewInstrument = typeof instruments.$inferInsert;
