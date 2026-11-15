import { pgTable, text, timestamp, uuid, numeric, varchar, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { instruments } from './instruments';

export const marketPrices = pgTable(
  'market_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    // Latest available traded price / NAV per unit in specified currency (supports up to 4 decimal places for AMFI NAVs)
    price: numeric('price', { precision: 18, scale: 4 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    dayChange: numeric('day_change', { precision: 18, scale: 4 }),
    dayChangePct: numeric('day_change_pct', { precision: 6, scale: 2 }),
    previousClose: numeric('previous_close', { precision: 18, scale: 4 }),
    high: numeric('high', { precision: 18, scale: 4 }),
    low: numeric('low', { precision: 18, scale: 4 }),
    // Explicit price as-of timestamp with timezone
    priceTimestamp: timestamp('price_timestamp', { withTimezone: true }).notNull(),
    // Data source attribution: 'AMFI' | 'NSE_EOD' | 'BSE_EOD' | 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'MANUAL'
    source: text('source').notNull(),
    // Price type: 'NAV' | 'LTP' | 'EOD' | 'REDEMPTION'
    priceType: text('price_type').default('LTP').notNull(),
    // Explicitly distinguishes live quote from end-of-day NAV or cached price
    isRealtime: boolean('is_realtime').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('market_prices_instrument_unique').on(table.instrumentId),
    index('market_prices_instrument_id_idx').on(table.instrumentId),
    index('market_prices_instrument_timestamp_idx').on(table.instrumentId, table.priceTimestamp),
  ]
);

export const marketPricesRelations = relations(marketPrices, ({ one }) => ({
  instrument: one(instruments, {
    fields: [marketPrices.instrumentId],
    references: [instruments.id],
  }),
}));

export type MarketPrice = typeof marketPrices.$inferSelect;
export type NewMarketPrice = typeof marketPrices.$inferInsert;
