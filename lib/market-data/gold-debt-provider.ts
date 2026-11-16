import type { MarketQuote } from './types';
import { fetchYahooChart } from './nse-provider';
import type { Instrument } from '@/lib/db/schema';

const GRAMS_PER_TROY_OUNCE = 31.1034768;
/** India's import duty on gold (5% basic customs duty + 1% AIDC since July 2024). IBJA rates exclude GST. */
const GOLD_IMPORT_DUTY = 0.06;

/** Domestic 999 gold rate per gram estimated from the international price, as a free proxy for IBJA. */
export function goldPerGramInr(usdPerOunce: number, usdInr: number): number {
  return Math.round(((usdPerOunce * usdInr) / GRAMS_PER_TROY_OUNCE) * (1 + GOLD_IMPORT_DUTY) * 100) / 100;
}

export interface Observation {
  value: number;
  ts: Date;
  source: string;
}

const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
// Sanity bounds that reject garbage without needing updates for years.
const isGoldUsd = (n: unknown): n is number => inRange(n, 500, 50_000);
const isUsdInr = (n: unknown): n is number => inRange(n, 40, 250);

function validDate(v: unknown, fallback: Date): Date {
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
}

/** gold-api.com: {"price": 3875.47, "updatedAt": "2026-11-16T12:23:59Z", ...} (USD per troy ounce). */
export function parseGoldApi(json: unknown, now = new Date()): Observation | null {
  const j = json as { price?: unknown; updatedAt?: unknown } | null;
  if (!j || !isGoldUsd(j.price)) return null;
  return { value: j.price, ts: validDate(j.updatedAt, now), source: 'gold-api.com' };
}

/** Frankfurter (European Central Bank reference rates): {"date": "2026-11-13", "rates": {"INR": 94.25}}. */
export function parseFrankfurterInr(json: unknown, now = new Date()): Observation | null {
  const j = json as { date?: unknown; rates?: { INR?: unknown } } | null;
  if (!j || !isUsdInr(j.rates?.INR)) return null;
  return { value: j.rates.INR, ts: validDate(j.date, now), source: 'ECB reference rate (Frankfurter)' };
}

/** open.er-api.com: {"result": "success", "time_last_update_unix": 1794787351, "rates": {"INR": 94.39}}. */
export function parseErApiInr(json: unknown, now = new Date()): Observation | null {
  const j = json as { result?: unknown; time_last_update_unix?: unknown; rates?: { INR?: unknown } } | null;
  if (!j || j.result !== 'success' || !isUsdInr(j.rates?.INR)) return null;
  const unix = typeof j.time_last_update_unix === 'number' ? j.time_last_update_unix * 1000 : undefined;
  return { value: j.rates.INR, ts: validDate(unix, now), source: 'open.er-api.com' };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; OmniScope price sync)' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function yahooLast(symbol: string, source: string, valid: (n: unknown) => n is number): Promise<Observation | null> {
  const bars = await fetchYahooChart(symbol, '5d');
  const last = bars[bars.length - 1];
  return last && valid(last.close) ? { value: last.close, ts: last.date, source } : null;
}

type Source = { name: string; fetch: () => Promise<Observation | null> };

/** Tries each source in order and returns the first usable answer, plus why the earlier ones failed. */
export async function firstAvailable(sources: Source[]): Promise<{ obs: Observation | null; errors: string[] }> {
  const errors: string[] = [];
  for (const s of sources) {
    try {
      const obs = await s.fetch();
      if (obs) return { obs, errors };
      errors.push(`${s.name}: no usable value`);
    } catch (err) {
      errors.push(`${s.name}: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }
  return { obs: null, errors };
}

// Yahoo Finance now answers most server requests with HTTP 429, so it is the last resort.
const GOLD_USD_SOURCES: Source[] = [
  { name: 'gold-api.com', fetch: async () => parseGoldApi(await getJson('https://api.gold-api.com/price/XAU')) },
  { name: 'Yahoo GC=F', fetch: () => yahooLast('GC=F', 'Yahoo Finance (COMEX GC=F)', isGoldUsd) },
];
const USD_INR_SOURCES: Source[] = [
  { name: 'Frankfurter', fetch: async () => parseFrankfurterInr(await getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR')) },
  { name: 'open.er-api.com', fetch: async () => parseErApiInr(await getJson('https://open.er-api.com/v6/latest/USD')) },
  { name: 'Yahoo INR=X', fetch: () => yahooLast('INR=X', 'Yahoo Finance (INR=X)', isUsdInr) },
];

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

  // Gold: estimate the domestic 999 gold price per gram from the international price (USD/oz) x USD/INR,
  // plus import duty, as a free proxy for the IBJA benchmark used for SGB redemption.
  let gold: { price: number; ts: Date; usd: Observation; fx: Observation } | null = null;
  if (targets.some((i) => i.assetClass === 'Gold')) {
    const [usd, fx] = await Promise.all([firstAvailable(GOLD_USD_SOURCES), firstAvailable(USD_INR_SOURCES)]);
    if (usd.obs && fx.obs) {
      gold = { price: goldPerGramInr(usd.obs.value, fx.obs.value), ts: usd.obs.ts, usd: usd.obs, fx: fx.obs };
    } else {
      const failed = [...(usd.obs ? [] : usd.errors), ...(fx.obs ? [] : fx.errors)];
      errors.push(`Gold reference estimate failed: ${failed.join('; ')}`);
    }
  }

  for (const inst of targets) {
    if (inst.assetClass === 'Gold') {
      if (gold) {
        quotes.push({
          instrumentId: inst.id,
          symbol: inst.symbol,
          price: gold.price,
          currency: 'INR',
          priceTimestamp: gold.ts,
          source: 'GOLD_REFERENCE_ESTIMATE',
          priceType: 'REDEMPTION',
          isRealtime: false,
          metadata: {
            method: 'International gold (USD/oz) x USD/INR / 31.1035 g x 1.06 import duty',
            usdPerOunce: gold.usd.value,
            usdPerOunceSource: gold.usd.source,
            usdInr: gold.fx.value,
            usdInrSource: gold.fx.source,
            usdInrDate: gold.fx.ts.toISOString(),
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
