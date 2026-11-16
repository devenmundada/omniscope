/**
 * Backfills daily NAV history for every mutual fund in the catalogue from mfapi.in (AMFI data).
 *
 *   npx tsx scripts/backfill-mf-history.mts [years=5]
 *
 * Reads DATABASE_URL from .env.local. Safe to re-run: rows are upserted on (instrument, date).
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
const url = env.DATABASE_URL?.replace(/(\.pooler\.supabase\.com):5432(?=[/?]|$)/, '$1:6543');
if (!url) throw new Error('DATABASE_URL missing in .env.local');
const sql = postgres(url, { prepare: false, max: 2 });

const years = Number(process.argv[2] ?? 5);
const cutoff = new Date(Date.now() - years * 365.25 * 86_400_000).toISOString().slice(0, 10);
const funds = await sql<{ id: string; symbol: string; amfi_code: string }[]>`
  select id, symbol, amfi_code from instruments where amfi_code is not null`;

for (const f of funds) {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(f.amfi_code)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    console.warn(`  ${f.symbol}: HTTP ${res.status}`);
    continue;
  }
  const data = (await res.json()) as { data?: Array<{ date: string; nav: string }> };
  const rows = (data.data ?? [])
    .map((r) => {
      const [dd, mm, yyyy] = r.date.split('-');
      return { instrument_id: f.id, price_date: `${yyyy}-${mm}-${dd}`, close: Number(r.nav).toFixed(4), source: 'AMFI_HISTORY' };
    })
    .filter((r) => r.price_date >= cutoff && Number(r.close) > 0);
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`
      insert into price_history ${sql(rows.slice(i, i + 1000), 'instrument_id', 'price_date', 'close', 'source')}
      on conflict (instrument_id, price_date) do update set close = excluded.close`;
  }
  console.log(`  ${f.symbol.padEnd(10)} ${rows.length} days from ${rows[rows.length - 1]?.price_date ?? '—'}`);
}
await sql.end();
