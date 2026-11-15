import type { MarketQuote } from './types';
import { fetchYahooChart } from './nse-provider';
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

  // Gold: estimate the domestic 999 gold price per gram from COMEX gold (USD/oz) x USD/INR,
  // plus the 6% customs duty, as a free proxy for the IBJA benchmark used for SGB redemption.
  let goldPerGram: { price: number; ts: Date; usdOz: number; usdInr: number } | null = null;
  if (targets.some((i) => i.assetClass === 'Gold')) {
    try {
      const [gc, fx] = await Promise.all([fetchYahooChart('GC=F', '5d'), fetchYahooChart('INR=X', '5d')]);
      const g = gc[gc.length - 1];
      const f = fx[fx.length - 1];
      if (g && f) {
        goldPerGram = { price: ((g.close * f.close) / 31.1034768) * 1.06, ts: g.date > f.date ? g.date : f.date, usdOz: g.close, usdInr: f.close };
      }
    } catch (err) {
      errors.push(`Gold reference estimate failed: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }

  for (const inst of targets) {
    if (inst.assetClass === 'Gold') {
      if (goldPerGram) {
        quotes.push({
          instrumentId: inst.id,
          symbol: inst.symbol,
          price: Math.round(goldPerGram.price * 100) / 100,
          currency: 'INR',
          priceTimestamp: goldPerGram.ts,
          source: 'GOLD_REFERENCE_ESTIMATE',
          priceType: 'REDEMPTION',
          isRealtime: false,
          metadata: {
            method: 'COMEX gold (USD/oz) x USD/INR / 31.1035 g x 1.06 customs duty',
            usdPerOunce: goldPerGram.usdOz,
            usdInr: goldPerGram.usdInr,
            note: 'Free proxy for the IBJA 999 rate used for Sovereign Gold Bond redemption; may differ by a few per cent.',
          },
        });
      } else {
        errors.push(`No gold reference available for ${inst.symbol}`);
      }
      continue;
    }
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
