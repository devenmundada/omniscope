import type { MarketQuote } from './types';
import { fetchNseEodQuotes } from './nse-provider';
import type { Instrument } from '@/lib/db/schema';

export interface EquityProviderConfig {
  apiKey?: string;
  providerName?: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'REFERENCE_EOD';
  allowEodFallback?: boolean;
}

/**
 * Static test fixtures for standard Indian equities & ETFs used strictly as offline development fallbacks
 * when external market data APIs (e.g. Twelve Data) are unconfigured.
 * NOTE: These are static test fixtures and MUST NOT be labeled as verified official exchange feeds.
 */
const STATIC_TEST_FIXTURE: Record<
  string,
  { price: number; previousClose: number; dayChange: number; dayChangePct: number; dateStr: string }
> = {
  RELIANCE: { price: 2942.50, previousClose: 2918.60, dayChange: 23.90, dayChangePct: 0.82, dateStr: '2026-10-15T15:30:00+05:30' },
  HDFCBANK: { price: 1712.00, previousClose: 1717.85, dayChange: -5.85, dayChangePct: -0.34, dateStr: '2026-10-15T15:30:00+05:30' },
  INFY: { price: 1878.25, previousClose: 1855.25, dayChange: 23.00, dayChangePct: 1.24, dateStr: '2026-10-15T15:30:00+05:30' },
  TCS: { price: 4066.00, previousClose: 4041.35, dayChange: 24.65, dayChangePct: 0.61, dateStr: '2026-10-15T15:30:00+05:30' },
  ITC: { price: 462.10, previousClose: 462.95, dayChange: -0.85, dayChangePct: -0.18, dateStr: '2026-10-15T15:30:00+05:30' },
  BAJFINANCE: { price: 7240.00, previousClose: 7094.55, dayChange: 145.45, dayChangePct: 2.05, dateStr: '2026-10-15T15:30:00+05:30' },
  TATAMOTORS: { price: 968.40, previousClose: 979.35, dayChange: -10.95, dayChangePct: -1.12, dateStr: '2026-10-15T15:30:00+05:30' },
  ICICIBANK: { price: 1245.50, previousClose: 1238.10, dayChange: 7.40, dayChangePct: 0.60, dateStr: '2026-10-15T15:30:00+05:30' },
  LT: { price: 3620.00, previousClose: 3598.00, dayChange: 22.00, dayChangePct: 0.61, dateStr: '2026-10-15T15:30:00+05:30' },
  SBIN: { price: 815.20, previousClose: 810.00, dayChange: 5.20, dayChangePct: 0.64, dateStr: '2026-10-15T15:30:00+05:30' },
  BHARTIARTL: { price: 1680.00, previousClose: 1665.00, dayChange: 15.00, dayChangePct: 0.90, dateStr: '2026-10-15T15:30:00+05:30' },
  HINDUNILVR: { price: 2750.00, previousClose: 2762.00, dayChange: -12.00, dayChangePct: -0.43, dateStr: '2026-10-15T15:30:00+05:30' },
  KOTAKBANK: { price: 1810.00, previousClose: 1802.00, dayChange: 8.00, dayChangePct: 0.44, dateStr: '2026-10-15T15:30:00+05:30' },
  AXISBANK: { price: 1195.00, previousClose: 1188.00, dayChange: 7.00, dayChangePct: 0.59, dateStr: '2026-10-15T15:30:00+05:30' },
  TITAN: { price: 3480.00, previousClose: 3450.00, dayChange: 30.00, dayChangePct: 0.87, dateStr: '2026-10-15T15:30:00+05:30' },

  // ETFs
  NIFTYBEES: { price: 268.45, previousClose: 267.14, dayChange: 1.31, dayChangePct: 0.49, dateStr: '2026-10-15T15:30:00+05:30' },
  JUNIORBEES: { price: 742.10, previousClose: 738.50, dayChange: 3.60, dayChangePct: 0.49, dateStr: '2026-10-15T15:30:00+05:30' },
  BANKBEES: { price: 524.80, previousClose: 521.20, dayChange: 3.60, dayChangePct: 0.69, dateStr: '2026-10-15T15:30:00+05:30' },
  GOLDBEES: { price: 68.20, previousClose: 67.95, dayChange: 0.25, dayChangePct: 0.37, dateStr: '2026-10-15T15:30:00+05:30' },
};

/**
 * Ingests end-of-day quotes for Equities and ETFs.
 * Primary: NSE official full bhavcopy (free, no key). Fallback: Yahoo Finance daily close.
 * Static fixtures are used only in local development and are always labelled unverified.
 */
export async function fetchEquityQuotes(
  instruments: Instrument[],
  config: EquityProviderConfig = {}
): Promise<{ quotes: MarketQuote[]; errors: string[]; providerUsed: string }> {
  const targetEquities = instruments.filter(
    (i) => i.assetClass === 'Indian Stocks' || i.assetClass === 'ETFs'
  );
  if (targetEquities.length === 0) {
    return { quotes: [], errors: [], providerUsed: 'NONE' };
  }

  const live = await fetchNseEodQuotes(targetEquities);
  const quotes: MarketQuote[] = [...live.quotes];
  const errors: string[] = [...live.errors];

  const allowFallback = config.allowEodFallback ?? process.env.NODE_ENV !== 'production';
  if (allowFallback) {
    for (const inst of live.missing) {
      const snap = STATIC_TEST_FIXTURE[inst.symbol.toUpperCase()];
      if (!snap) continue;
      quotes.push({
        instrumentId: inst.id,
        symbol: inst.symbol,
        price: snap.price,
        currency: 'INR',
        previousClose: snap.previousClose,
        dayChange: snap.dayChange,
        dayChangePct: snap.dayChangePct,
        priceTimestamp: new Date(snap.dateStr),
        source: 'STATIC_REFERENCE_FIXTURE',
        priceType: 'UNVERIFIED_REFERENCE',
        isRealtime: false,
        metadata: { exchange: inst.exchange || 'NSE', isVerified: false, fixtureNote: 'Offline development fixture.' },
      });
    }
  } else if (live.missing.length > 0) {
    errors.push(`No verified EOD quote for: ${live.missing.map((m) => m.symbol).join(', ')}`);
  }

  return { quotes, errors, providerUsed: live.providerUsed };
}
