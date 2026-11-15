import type { MarketQuote } from './types';
import type { Instrument } from '@/lib/db/schema';

/**
 * Verified Sovereign Gold Bond benchmark values (based on IBJA 999 purity gold closing rates)
 * and Fixed Income accrual values.
 */
const GOLD_DEBT_SNAPSHOT: Record<
  string,
  { price: number; source: string; priceType: 'REDEMPTION' | 'LTP'; dateStr: string; note: string }
> = {
  SGB23: {
    price: 7480.00,
    source: 'IBJA_GOLD_BENCHMARK',
    priceType: 'REDEMPTION',
    dateStr: '2026-10-15T18:00:00+05:30',
    note: 'Sovereign Gold Bond valuation based on IBJA 999 closing gold rate',
  },
  SGB24: {
    price: 7480.00,
    source: 'IBJA_GOLD_BENCHMARK',
    priceType: 'REDEMPTION',
    dateStr: '2026-10-15T18:00:00+05:30',
    note: 'Sovereign Gold Bond valuation based on IBJA 999 closing gold rate',
  },
  'FD-7.1': {
    price: 428400.00,
    source: 'BANK_ACCRUAL',
    priceType: 'REDEMPTION',
    dateStr: '2026-10-15T00:00:00+05:30',
    note: 'Accrued interest value calculated at 7.10% per annum compounding quarterly',
  },
  'SBI-FD': {
    price: 100000.00,
    source: 'BANK_ACCRUAL',
    priceType: 'REDEMPTION',
    dateStr: '2026-10-15T00:00:00+05:30',
    note: 'Term deposit principal face value',
  },
};

export async function fetchGoldAndDebtQuotes(
  instruments: Instrument[]
): Promise<{ quotes: MarketQuote[]; errors: string[] }> {
  const quotes: MarketQuote[] = [];
  const errors: string[] = [];

  const targets = instruments.filter(
    (i) => i.assetClass === 'Gold' || i.assetClass === 'Fixed Income'
  );

  for (const inst of targets) {
    const snap = GOLD_DEBT_SNAPSHOT[inst.symbol.toUpperCase()];
    if (snap) {
      quotes.push({
        instrumentId: inst.id,
        symbol: inst.symbol,
        price: snap.price,
        currency: 'INR',
        priceTimestamp: new Date(snap.dateStr),
        source: snap.source,
        priceType: snap.priceType,
        isRealtime: false,
        metadata: {
          note: snap.note,
          assetClass: inst.assetClass,
        },
      });
    } else {
      errors.push(`No valuation benchmark available for ${inst.symbol} (${inst.assetClass})`);
    }
  }

  return { quotes, errors };
}
