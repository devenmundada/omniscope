import { pgTable, text, timestamp, uuid, numeric, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { instruments } from './instruments';

export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    priceDate: date('price_date').notNull(),
    close: numeric('close', { precision: 18, scale: 4 }).notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('price_history_instrument_date_unique').on(table.instrumentId, table.priceDate),
    index('price_history_date_idx').on(table.priceDate),
  ]
);

export type PriceHistoryRow = typeof priceHistory.$inferSelect;
