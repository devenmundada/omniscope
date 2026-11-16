/**
 * Backfills adjusted daily closing prices for every NSE-listed instrument in the catalogue
 * from NSE's official bhavcopy archive.
 *
 *   npx tsx scripts/backfill-nse-history.mts [calendarDays=750]
 *
 * Reads DATABASE_URL from .env.local. Safe to re-run: rows are upserted on (instrument, date).
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { parseNseBhavcopy } from '../lib/market-data/nse-provider.ts';
import { bhavcopyUrl, buildAdjustedCloses, recentWeekdays, type BhavDay } from '../lib/market-data/nse-history.ts';

const env = dotenv.parse(fs.readFileSync('.env.local'));
const url = env.DATABASE_URL?.replace(/(\.pooler\.supabase\.com):5432(?=[/?]|$)/, '$1:6543');
if (!url) throw new Error('DATABASE_URL missing in .env.local');
const sql = postgres(url, { prepare: false, max: 2 });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/csv,*/*',
  Referer: 'https://www.nseindia.com/',
};

const calendarDays = Number(process.argv[2] ?? 750);
const instruments = await sql<{ id: string; symbol: string }[]>`
  select id, upper(symbol) as symbol from instruments where asset_class in ('Indian Stocks', 'ETFs')`;
const wanted = new Set(instruments.map((i) => i.symbol));
console.log(`Instruments: ${instruments.length}; looking back ${calendarDays} calendar days`);

async function fetchDay(date: string): Promise<BhavDay | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(bhavcopyUrl(date), { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return null; // market holiday
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = new Map<string, { close: number; prevClose: number | null }>();
      const series = new Map<string, string>();
      for (const r of parseNseBhavcopy(await res.text())) {
        if (!wanted.has(r.symbol)) continue;
        // Prefer the regular equity series when a symbol trades in several.
        if (rows.has(r.symbol) && series.get(r.symbol) === 'EQ') continue;
        rows.set(r.symbol, { close: r.close, prevClose: r.prevClose });
        series.set(r.symbol, r.series);
      }
      return { date, rows };
    } catch (err) {
      if (attempt === 5) console.warn(`  ${date}: ${(err as Error).message} (skipped)`);
      // NSE answers bursts with HTTP 403; back off before retrying.
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  return null;
}

const dates = recentWeekdays(calendarDays);
const days: BhavDay[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < dates.length) {
      const date = dates[next++];
      const day = await fetchDay(date);
      if (day && day.rows.size > 0) days.push(day);
    }
  })
);
console.log(`Trading days downloaded: ${days.length} of ${dates.length} weekdays`);

const series = buildAdjustedCloses(days, [...wanted]);
const rows: Array<{ instrument_id: string; price_date: string; close: string; source: string }> = [];
for (const inst of instruments) {
  for (const p of series.get(inst.symbol) ?? []) {
    rows.push({ instrument_id: inst.id, price_date: p.date, close: p.close.toFixed(4), source: 'NSE_BHAVCOPY' });
  }
}

// Replace the whole window in one transaction, so no row from an earlier run (adjusted to a
// different base) can survive next to the new series.
const earliest = days.map((d) => d.date).sort()[0];
await sql.begin(async (tx) => {
  await tx`
    delete from price_history
    where instrument_id in ${tx(instruments.map((i) => i.id))} and price_date >= ${earliest}`;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await tx`
      insert into price_history ${tx(chunk, 'instrument_id', 'price_date', 'close', 'source')}
      on conflict (instrument_id, price_date) do update set close = excluded.close, source = excluded.source`;
  }
});
console.log(`Upserted ${rows.length} rows`);
for (const inst of instruments) {
  const s = series.get(inst.symbol);
  console.log(`  ${inst.symbol.padEnd(12)} ${s ? `${s.length} days, ${s[0].date} → ${s[s.length - 1].date}` : 'not traded'}`);
}
await sql.end();
