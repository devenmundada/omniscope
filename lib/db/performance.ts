import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { instruments } from './schema';
import type { UserHoldingView } from './portfolio';
import { xirr } from '@/lib/math/xirr';
import { getHistory, BENCHMARK_SYMBOL, type HistoryPoint } from '@/lib/market-data/history';

export interface GrowthPoint {
  date: string;
  value: number;
  invested: number;
  benchmark: number | null;
}

export interface AssetClassStats {
  assetClass: string;
  annualReturn: number;
  annualVolatility: number;
  observations: number;
}

export interface PortfolioPerformance {
  xirrPct: number | null;
  xirrCoverage: { holdingsWithDate: number; holdingsTotal: number };
  growth: GrowthPoint[];
  growthNote: string;
  benchmarkReturnPct: number | null;
  portfolioReturn1yPct: number | null;
  assetClassStats: AssetClassStats[];
  historyAvailable: boolean;
}

function ffill(points: HistoryPoint[] | undefined, dates: string[]): (number | null)[] {
  if (!points || points.length === 0) return dates.map(() => null);
  const out: (number | null)[] = [];
  let j = 0;
  let last: number | null = null;
  for (const d of dates) {
    while (j < points.length && points[j].date <= d) { last = points[j].close; j++; }
    out.push(last);
  }
  return out;
}

/** Long-run defaults used when an asset class has too little price history. */
const DEFAULT_STATS: Record<string, { r: number; v: number }> = {
  'Indian Stocks': { r: 0.12, v: 0.2 },
  'Mutual Funds': { r: 0.11, v: 0.16 },
  ETFs: { r: 0.11, v: 0.16 },
  Gold: { r: 0.08, v: 0.14 },
  'Fixed Income': { r: 0.07, v: 0.01 },
  International: { r: 0.11, v: 0.2 },
};
export function defaultStatsFor(assetClass: string) {
  return DEFAULT_STATS[assetClass] ?? { r: 0.1, v: 0.15 };
}

/**
 * Computes XIRR, a one-year growth series against the Nifty 50 benchmark, and per-asset-class
 * return/volatility statistics from stored daily price history. Only verified-priced holdings are used.
 */
export async function getPortfolioPerformance(holdings: UserHoldingView[]): Promise<PortfolioPerformance> {
  const priced = holdings.filter((h) => h.currentValue != null);
  const now = new Date();

  // 1. XIRR from purchase dates (or the date the holding was recorded) and today's verified value
  const flows = priced.flatMap((h) => [
    { amount: -h.investedAmount, date: new Date(h.firstPurchasedAt ?? h.createdAt) },
    { amount: h.currentValue as number, date: now },
  ]);
  const xr = xirr(flows);
  const holdingsWithDate = priced.filter((h) => h.firstPurchasedAt != null).length;

  // 2. Growth series over the last 365 days
  const since = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const [bench] = await db.select({ id: instruments.id }).from(instruments).where(eq(instruments.symbol, BENCHMARK_SYMBOL)).limit(1);
  const ids = [...new Set(priced.map((h) => h.instrumentId))];
  const hist = await getHistory(bench ? [...ids, bench.id] : ids, since);

  const dateSet = new Set<string>();
  for (const id of ids) for (const p of hist.get(id) ?? []) dateSet.add(p.date);
  const dates = [...dateSet].sort();
  // Weekly sampling keeps the chart light
  const sampled = dates.filter((_, i) => i % 5 === 0 || i === dates.length - 1);

  const growth: GrowthPoint[] = [];
  let historyAvailable = false;
  if (sampled.length >= 10) {
    historyAvailable = true;
    const perHolding = priced.map((h) => ({ h, series: ffill(hist.get(h.instrumentId), sampled) }));
    const benchSeries = bench ? ffill(hist.get(bench.id), sampled) : sampled.map(() => null);
    const invested = priced.reduce((s, h) => s + h.investedAmount, 0);
    let benchBase: number | null = null;
    let valueBase: number | null = null;
    sampled.forEach((d, i) => {
      let v = 0;
      for (const { h, series } of perHolding) {
        const px = series[i] ?? h.currentPrice ?? 0;
        v += h.units * px;
      }
      if (valueBase == null) valueBase = v;
      const b = benchSeries[i];
      if (b != null && benchBase == null) benchBase = b;
      growth.push({
        date: d,
        value: Math.round(v),
        invested: Math.round(invested),
        benchmark: b != null && benchBase != null && valueBase != null ? Math.round((b / benchBase) * valueBase) : null,
      });
    });
  }

  const first = growth[0];
  const last = growth[growth.length - 1];
  const portfolioReturn1yPct = first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;
  const benchmarkReturnPct =
    first && last && first.benchmark && last.benchmark ? ((last.benchmark - first.benchmark) / first.benchmark) * 100 : null;

  // 3. Asset-class statistics from an equal-weight daily basket of each class's holdings over up to
  // 3 years. A basket (not pooled returns) keeps the diversification inside the class.
  const since3y = new Date(now.getTime() - 3 * 365 * 86400000).toISOString().slice(0, 10);
  const longHist = await getHistory(ids, since3y);
  const byClass = new Map<string, Map<string, number[]>>(); // class -> date -> instrument returns
  for (const h of priced) {
    const pts = longHist.get(h.instrumentId) ?? [];
    const dates = byClass.get(h.assetClass) ?? new Map<string, number[]>();
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1].close > 0 && pts[i].close > 0) {
        const arr = dates.get(pts[i].date) ?? [];
        arr.push(Math.log(pts[i].close / pts[i - 1].close));
        dates.set(pts[i].date, arr);
      }
    }
    byClass.set(h.assetClass, dates);
  }
  const assetClassStats: AssetClassStats[] = [...new Set(priced.map((h) => h.assetClass))].map((ac) => {
    const rets = [...(byClass.get(ac) ?? new Map<string, number[]>()).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, day]) => day.reduce((a, b) => a + b, 0) / day.length);
    const def = defaultStatsFor(ac);
    if (rets.length < 120) return { assetClass: ac, annualReturn: def.r, annualVolatility: def.v, observations: rets.length };
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    const vol = Math.sqrt(variance * 252);
    // Shrink the sample mean toward the long-run default, giving history the weight of its length
    // against a five-year prior (same rule as the Risk Lab), so a short boom or bust is not extrapolated.
    const years = rets.length / 252;
    const historyWeight = years / (years + 5);
    const sampleAnnual = Math.exp(mean * 252) - 1;
    const annualReturn = historyWeight * sampleAnnual + (1 - historyWeight) * def.r;
    return { assetClass: ac, annualReturn, annualVolatility: Math.max(0.01, vol), observations: rets.length };
  });

  return {
    xirrPct: xr != null ? xr * 100 : null,
    xirrCoverage: { holdingsWithDate, holdingsTotal: priced.length },
    growth,
    growthNote: 'Growth line values your current units at each day\'s verified closing price (it does not replay past buys or sells). Benchmark: Nifty 50 ETF scaled to the same starting value.',
    benchmarkReturnPct,
    portfolioReturn1yPct,
    assetClassStats,
    historyAvailable,
  };
}
