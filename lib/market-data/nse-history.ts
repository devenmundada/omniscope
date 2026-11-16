/**
 * Rebuilds daily closing-price history from NSE bhavcopy files.
 *
 * Bhavcopy prices are not adjusted for bonuses or splits: on HDFC Bank's 1:1 bonus ex-date
 * (26 Aug 2025) the file shows PREV_CLOSE 1964.10 and CLOSE 973.40. Large-cap shares almost never
 * move more than 25% in a day, so a one-day ratio beyond that which sits close to a simple
 * bonus/split factor (1/2, 1/5, 1/10, 2/3 ...) is treated as a corporate action and only the
 * residual move is kept. Chaining the cleaned returns backwards from the latest close gives a
 * series adjusted the way charting services adjust prices, without a corporate-actions feed.
 */

/** Bonus/split price factors p/q with small integers (e.g. 1:1 bonus = 1/2, 1:5 split = 1/5). */
const CORPORATE_ACTION_FACTORS: number[] = (() => {
  const set = new Set<number>();
  for (let q = 2; q <= 20; q++) {
    for (let p = 1; p < q; p++) {
      if (q <= 10 || p === 1) {
        set.add(p / q);
        set.add(q / p); // reverse split / consolidation
      }
    }
  }
  return [...set];
})();

/** Moves bigger than this in one day are checked against corporate-action factors. */
const CORPORATE_ACTION_THRESHOLD = 0.25;

/**
 * If a one-day price ratio looks like a bonus or split, returns the factor to divide it by;
 * otherwise 1. The residual (ratio / factor) must be within ±15% to count as a match.
 */
export function corporateActionFactor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) <= CORPORATE_ACTION_THRESHOLD) return 1;
  let best = 1;
  let bestErr = Infinity;
  for (const f of CORPORATE_ACTION_FACTORS) {
    const err = Math.abs(Math.log(ratio / f));
    if (err < bestErr) {
      bestErr = err;
      best = f;
    }
  }
  return bestErr <= Math.log(1.15) ? best : 1;
}

export interface BhavDayRow {
  close: number;
  /** As published; NSE does not adjust it for bonuses or splits. */
  prevClose?: number | null;
}

export interface BhavDay {
  /** Trading date as YYYY-MM-DD (IST). */
  date: string;
  rows: Map<string, BhavDayRow>;
}

export interface AdjustedPoint {
  date: string;
  close: number;
}

/** Returns adjusted daily closes for each symbol, oldest first. Symbols with no rows are omitted. */
export function buildAdjustedCloses(days: BhavDay[], symbols: string[]): Map<string, AdjustedPoint[]> {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, AdjustedPoint[]>();

  for (const symbol of symbols) {
    const entries: Array<{ date: string } & BhavDayRow> = [];
    for (const day of sorted) {
      const row = day.rows.get(symbol);
      if (row && row.close > 0) entries.push({ date: day.date, ...row });
    }
    if (entries.length === 0) continue;

    const adjusted: AdjustedPoint[] = new Array(entries.length);
    const last = entries[entries.length - 1];
    adjusted[entries.length - 1] = { date: last.date, close: last.close };
    for (let i = entries.length - 2; i >= 0; i--) {
      const next = entries[i + 1];
      // Price ratio between consecutive available closes (so a missing file never drops a move),
      // with any bonus/split factor removed. PREV_CLOSE is not used: NSE does not adjust it.
      const raw = next.close / entries[i].close;
      const ratio = raw / corporateActionFactor(raw);
      adjusted[i] = { date: entries[i].date, close: adjusted[i + 1].close / ratio };
    }
    out.set(
      symbol,
      adjusted.map((p) => ({ date: p.date, close: Math.round(p.close * 10000) / 10000 }))
    );
  }
  return out;
}

/** Weekday dates (YYYY-MM-DD, IST) from `from` back `calendarDays` days, newest first. */
export function recentWeekdays(calendarDays: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let back = 0; back <= calendarDays; back++) {
    const ist = new Date(from.getTime() + 5.5 * 3600_000 - back * 86_400_000);
    const dow = ist.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(ist.toISOString().slice(0, 10));
  }
  return out;
}

/** NSE archive URL for a trading date given as YYYY-MM-DD. */
export function bhavcopyUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${d}${m}${y}.csv`;
}
