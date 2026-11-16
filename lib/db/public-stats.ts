import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from './index';

export interface SourceFreshness {
  source: string;
  label: string;
  instruments: number;
  latest: string | null;
}

export interface PublicStats {
  instruments: number;
  historyRows: number;
  tradingDays: number;
  historyFrom: string | null;
  sources: SourceFreshness[];
}

const SOURCE_LABELS: Record<string, string> = {
  NSE_EOD: 'NSE official closing prices (bhavcopy)',
  AMFI: 'AMFI mutual fund NAVs',
  GOLD_REFERENCE_ESTIMATE: 'Gold reference rate (gold-api.com × ECB USD/INR)',
  YAHOO_EOD: 'Yahoo Finance closing prices (fallback)',
  IBJA_GOLD_BENCHMARK: 'IBJA gold benchmark',
  BANK_ACCRUAL: 'Fixed-deposit accrual',
};

/** Non-personal facts about the market data OmniScope holds, for the public pages. */
export async function getPublicStats(): Promise<PublicStats | null> {
  try {
    const [counts, sources, days] = await Promise.all([
      db.execute(sql`select (select count(*) from instruments)::int as instruments, (select count(*) from price_history)::int as history_rows`),
      db.execute(sql`select source, count(*)::int as n, max(price_timestamp) as latest from market_prices group by source order by n desc`),
      db.execute(sql`
        select count(*)::int as days, min(ph.price_date)::text as first
        from price_history ph join instruments i on i.id = ph.instrument_id
        where i.symbol = 'NIFTYBEES'`),
    ]);
    const c = counts[0] as { instruments: number; history_rows: number };
    const d = days[0] as { days: number; first: string | null };
    return {
      instruments: c.instruments,
      historyRows: c.history_rows,
      tradingDays: d.days,
      historyFrom: d.first,
      sources: (sources as unknown as Array<{ source: string; n: number; latest: Date | string | null }>).map((s) => ({
        source: s.source,
        label: SOURCE_LABELS[s.source] ?? s.source,
        instruments: s.n,
        latest: s.latest ? new Date(s.latest).toISOString() : null,
      })),
    };
  } catch {
    return null;
  }
}
