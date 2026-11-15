import type { MarketQuote } from './types';
import type { Instrument } from '@/lib/db/schema';

/**
 * Free, key-less end-of-day price sources for NSE-listed equities and ETFs.
 *
 * 1. NSE "full bhavcopy" — the exchange's official daily closing-price file
 *    (sec_bhavdata_full_DDMMYYYY.csv). One request returns every listed security.
 * 2. Yahoo Finance chart API (SYMBOL.NS) — used only as a per-symbol fallback when the
 *    bhavcopy cannot be downloaded (NSE occasionally blocks datacenter traffic) and for
 *    backfilling daily price history.
 *
 * Both are end-of-day closes, never intraday prices.
 */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/csv,text/plain,application/json,*/*',
  'Accept-Language': 'en-IN,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
};

export interface BhavRow {
  symbol: string;
  series: string;
  date: Date;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
}

function istDateParts(d: Date) {
  // Convert to IST calendar date
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, day: ist.getUTCDate(), dow: ist.getUTCDay() };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Parses the NSE full bhavcopy CSV. Header names are matched case-insensitively and trimmed. */
export function parseNseBhavcopy(csv: string): BhavRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);
  const iSym = idx('SYMBOL');
  const iSer = idx('SERIES');
  const iDate = idx('DATE1');
  const iPrev = idx('PREV_CLOSE');
  const iOpen = idx('OPEN_PRICE');
  const iHigh = idx('HIGH_PRICE');
  const iLow = idx('LOW_PRICE');
  const iClose = idx('CLOSE_PRICE');
  if (iSym < 0 || iClose < 0) return [];
  const num = (v: string | undefined) => {
    const n = parseFloat((v || '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const out: BhavRow[] = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',');
    const close = num(c[iClose]);
    if (close == null || close <= 0) continue;
    const dateStr = iDate >= 0 ? (c[iDate] || '').trim() : '';
    const parsed = dateStr ? new Date(`${dateStr} 15:30:00 GMT+0530`) : new Date();
    out.push({
      symbol: (c[iSym] || '').trim().toUpperCase(),
      series: iSer >= 0 ? (c[iSer] || '').trim().toUpperCase() : 'EQ',
      date: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
      prevClose: iPrev >= 0 ? num(c[iPrev]) : null,
      open: iOpen >= 0 ? num(c[iOpen]) : null,
      high: iHigh >= 0 ? num(c[iHigh]) : null,
      low: iLow >= 0 ? num(c[iLow]) : null,
      close,
    });
  }
  return out;
}

/** Downloads the most recent available NSE bhavcopy, looking back up to `maxDays` calendar days. */
export async function fetchLatestNseBhavcopy(maxDays = 7, now = new Date()): Promise<{ rows: BhavRow[]; fileDate: string } | null> {
  for (let back = 0; back <= maxDays; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const { y, m, day, dow } = istDateParts(d);
    if (dow === 0 || dow === 6) continue; // weekends
    const tag = `${pad(day)}${pad(m)}${y}`;
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${tag}.csv`;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(12000), cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const rows = parseNseBhavcopy(text);
      if (rows.length > 100) return { rows, fileDate: `${y}-${pad(m)}-${pad(day)}` };
    } catch {
      // try previous day
    }
  }
  return null;
}

export interface YahooDailyBar {
  date: Date;
  close: number;
}

/** Fetches daily closes for an NSE symbol from Yahoo Finance's public chart endpoint. */
export async function fetchYahooDaily(symbol: string, range = '5d'): Promise<YahooDailyBar[]> {
  return fetchYahooChart(`${symbol}.NS`, range);
}

/** Fetches daily closes for any Yahoo Finance symbol (e.g. GC=F, INR=X). */
export async function fetchYahooChart(yahooSymbol: string, range = '5d'): Promise<YahooDailyBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const ts: number[] = r?.timestamp || [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close || [];
  const out: YahooDailyBar[] = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (c != null && Number.isFinite(c) && c > 0) out.push({ date: new Date(t * 1000), close: c });
  });
  return out;
}

/**
 * Returns verified end-of-day quotes for the given equities/ETFs.
 * NSE bhavcopy first; Yahoo per-symbol fallback for anything missing.
 */
export async function fetchNseEodQuotes(
  instruments: Instrument[]
): Promise<{ quotes: MarketQuote[]; errors: string[]; providerUsed: string; missing: Instrument[] }> {
  const quotes: MarketQuote[] = [];
  const errors: string[] = [];
  const targets = instruments.filter((i) => i.assetClass === 'Indian Stocks' || i.assetClass === 'ETFs');
  if (targets.length === 0) return { quotes, errors, providerUsed: 'NONE', missing: [] };

  const providers = new Set<string>();
  let missing: Instrument[] = [...targets];

  const bhav = await fetchLatestNseBhavcopy();
  if (bhav) {
    const bySymbol = new Map<string, BhavRow>();
    for (const r of bhav.rows) {
      // Prefer the regular equity series when a symbol trades in several series
      const prev = bySymbol.get(r.symbol);
      if (!prev || r.series === 'EQ') bySymbol.set(r.symbol, r);
    }
    const still: Instrument[] = [];
    for (const inst of missing) {
      const row = bySymbol.get(inst.symbol.toUpperCase());
      if (!row) { still.push(inst); continue; }
      const change = row.prevClose != null ? row.close - row.prevClose : null;
      quotes.push({
        instrumentId: inst.id,
        symbol: inst.symbol,
        price: row.close,
        currency: 'INR',
        previousClose: row.prevClose,
        dayChange: change,
        dayChangePct: change != null && row.prevClose ? (change / row.prevClose) * 100 : null,
        high: row.high,
        low: row.low,
        priceTimestamp: row.date,
        source: 'NSE_EOD',
        priceType: 'EOD',
        isRealtime: false,
        metadata: { exchange: 'NSE', series: row.series, file: `sec_bhavdata_full (${bhav.fileDate})`, isOfficialClose: true },
      });
      providers.add('NSE_BHAVCOPY');
    }
    missing = still;
  } else {
    errors.push('NSE bhavcopy unavailable for the last 7 days; using Yahoo Finance EOD fallback.');
  }

  const stillMissing: Instrument[] = [];
  for (const inst of missing) {
    try {
      const bars = await fetchYahooDaily(inst.symbol, '5d');
      if (bars.length === 0) { stillMissing.push(inst); continue; }
      const last = bars[bars.length - 1];
      const prev = bars.length > 1 ? bars[bars.length - 2] : null;
      const change = prev ? last.close - prev.close : null;
      quotes.push({
        instrumentId: inst.id,
        symbol: inst.symbol,
        price: last.close,
        currency: 'INR',
        previousClose: prev?.close ?? null,
        dayChange: change,
        dayChangePct: change != null && prev ? (change / prev.close) * 100 : null,
        priceTimestamp: last.date,
        source: 'YAHOO_EOD',
        priceType: 'EOD',
        isRealtime: false,
        metadata: { exchange: 'NSE', provider: 'Yahoo Finance chart API', isOfficialClose: false },
      });
      providers.add('YAHOO_EOD');
    } catch (err) {
      stillMissing.push(inst);
      errors.push(`EOD fallback failed for ${inst.symbol}: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }

  return { quotes, errors, providerUsed: [...providers].join('+') || 'NONE', missing: stillMissing };
}
