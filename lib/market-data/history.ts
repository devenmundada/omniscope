import 'server-only';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { holdings, instruments, priceHistory } from '@/lib/db/schema';
import type { Instrument } from '@/lib/db/schema';
import type { MarketQuote } from './types';
import { fetchYahooDaily } from './nse-provider';

export const BENCHMARK_SYMBOL = 'NIFTYBEES';

/** IST calendar date (YYYY-MM-DD) for a timestamp. */
export function istDate(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Records verified observations as daily closes. Unverified fixtures are never stored as history. */
export async function recordHistory(quotes: MarketQuote[]): Promise<number> {
  const rows = quotes
    .filter((q) => q.priceType !== 'UNVERIFIED_REFERENCE')
    .map((q) => ({ instrumentId: q.instrumentId, priceDate: istDate(q.priceTimestamp), close: q.price.toFixed(4), source: q.source }));
  if (rows.length === 0) return 0;
  await db
    .insert(priceHistory)
    .values(rows)
    .onConflictDoUpdate({
      target: [priceHistory.instrumentId, priceHistory.priceDate],
      set: { close: sql`excluded.close`, source: sql`excluded.source` },
    });
  return rows.length;
}

async function insertBars(instrumentId: string, bars: { date: string; close: number }[], source: string) {
  if (bars.length === 0) return 0;
  const chunk = 400;
  for (let i = 0; i < bars.length; i += chunk) {
    await db
      .insert(priceHistory)
      .values(bars.slice(i, i + chunk).map((b) => ({ instrumentId, priceDate: b.date, close: b.close.toFixed(4), source })))
      .onConflictDoNothing();
  }
  return bars.length;
}

/** Fetches up to ~3 years of daily NAVs from mfapi.in (free mirror of AMFI history). */
async function fetchMfHistory(amfiCode: string): Promise<{ date: string; close: number }[]> {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(amfiCode)}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
  const data = await res.json();
  const cutoff = Date.now() - 3 * 365 * 86400000;
  const out: { date: string; close: number }[] = [];
  for (const r of (data?.data || []) as { date: string; nav: string }[]) {
    const [dd, mm, yyyy] = r.date.split('-');
    const iso = `${yyyy}-${mm}-${dd}`;
    const t = Date.parse(iso);
    const nav = parseFloat(r.nav);
    if (Number.isFinite(t) && t >= cutoff && nav > 0) out.push({ date: iso, close: nav });
  }
  return out;
}

/**
 * Backfills daily history for instruments that are actually held by users and have
 * fewer than `minRows` observations. Equities/ETFs: Yahoo (2y). Mutual funds: mfapi.in (3y).
 */
export async function backfillHeldInstrumentHistory(minRows = 120): Promise<{ backfilled: string[]; errors: string[] }> {
  const held = await db
    .selectDistinct({ id: instruments.id, symbol: instruments.symbol, assetClass: instruments.assetClass, amfiCode: instruments.amfiCode })
    .from(holdings)
    .innerJoin(instruments, eq(holdings.instrumentId, instruments.id));
  // Always keep the benchmark (Nifty 50 ETF) history for portfolio comparisons.
  const [bench] = await db
    .select({ id: instruments.id, symbol: instruments.symbol, assetClass: instruments.assetClass, amfiCode: instruments.amfiCode })
    .from(instruments)
    .where(eq(instruments.symbol, BENCHMARK_SYMBOL))
    .limit(1);
  if (bench && !held.some((h) => h.id === bench.id)) held.push(bench);
  if (held.length === 0) return { backfilled: [], errors: [] };

  const counts = await db
    .select({ id: priceHistory.instrumentId, n: sql<number>`count(*)::int` })
    .from(priceHistory)
    .where(inArray(priceHistory.instrumentId, held.map((h) => h.id)))
    .groupBy(priceHistory.instrumentId);
  const countMap = new Map(counts.map((c) => [c.id, Number(c.n)]));
  const todo = held.filter((h) => (countMap.get(h.id) ?? 0) < minRows);

  const backfilled: string[] = [];
  const errors: string[] = [];
  await Promise.all(
    todo.map(async (inst) => {
      try {
        if (inst.assetClass === 'Indian Stocks' || inst.assetClass === 'ETFs') {
          const bars = await fetchYahooDaily(inst.symbol, '2y');
          await insertBars(inst.id, bars.map((b) => ({ date: istDate(b.date), close: b.close })), 'YAHOO_EOD');
          backfilled.push(inst.symbol);
        } else if (inst.assetClass === 'Mutual Funds' && inst.amfiCode) {
          const bars = await fetchMfHistory(inst.amfiCode);
          await insertBars(inst.id, bars, 'AMFI_HISTORY');
          backfilled.push(inst.symbol);
        }
      } catch (err) {
        errors.push(`History backfill failed for ${inst.symbol}: ${err instanceof Error ? err.message : 'error'}`);
      }
    })
  );
  return { backfilled, errors };
}

export interface HistoryPoint { date: string; close: number }

/** Loads daily closes for a set of instruments since a date. */
export async function getHistory(instrumentIds: string[], sinceIso: string): Promise<Map<string, HistoryPoint[]>> {
  const map = new Map<string, HistoryPoint[]>();
  if (instrumentIds.length === 0) return map;
  const rows = await db
    .select({ id: priceHistory.instrumentId, date: priceHistory.priceDate, close: priceHistory.close })
    .from(priceHistory)
    .where(and(inArray(priceHistory.instrumentId, instrumentIds), gte(priceHistory.priceDate, sinceIso)))
    .orderBy(asc(priceHistory.priceDate));
  for (const r of rows) {
    const arr = map.get(r.id) ?? [];
    arr.push({ date: String(r.date), close: Number(r.close) });
    map.set(r.id, arr);
  }
  return map;
}

export type { Instrument };
