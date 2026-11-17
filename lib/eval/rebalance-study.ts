/**
 * A reproducible simulation study of the tax-smart rebalancer. Pure functions.
 *
 * Each trial draws a synthetic Indian portfolio (equity, gold and debt funds held across one to
 * three demat accounts, in lots bought over the last four years at prices that leave a mix of
 * gains and losses), a random target mix, and a one-factor covariance. The tax-smart path and the
 * naive path (sell a fraction of the full rebalance, oldest units first) are then compared at the
 * same closeness to the target. A fixed seed makes every run identical.
 */
import { mulberry32 } from '@/lib/math/optimizer';
import { naiveCostAt, rebalancePath, type RebalanceAsset, type RebalanceInput } from '@/lib/math/rebalance';
import type { TaxCategory } from '@/lib/math/tax';

export const STUDY_AS_OF = '2026-11-17';

export interface StudyTrial {
  seed: number;
  assets: number;
  value: number;
  /** Tax and total cost (tax + charges) when 90% of the gap is closed. */
  smart90: { tax: number; cost: number };
  naive90: { tax: number; cost: number };
  /** Full rebalance (smart path end versus naive α = 1). */
  smartFull: { tax: number; cost: number };
  naiveFull: { tax: number; cost: number };
}

export interface StudySummary {
  trials: number;
  /** Share of trials where the smart plan cost no more than the naive one at 90% alignment. */
  smartNoWorse90: number;
  medianTaxSaved90Pct: number;
  meanTaxSaved90Pct: number;
  totalTaxSmart90: number;
  totalTaxNaive90: number;
  medianCostSaved90Pct: number;
  totalTaxSmartFull: number;
  totalTaxNaiveFull: number;
  zeroTaxSmart90: number;
  /** Where the smart plan cost more, the median extra cost in rupees. */
  worseMedianExtra: number;
}

function normal(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One synthetic portfolio and target, fully determined by the seed. */
export function syntheticCase(seed: number): RebalanceInput {
  const rand = mulberry32(seed);
  const n = 4 + Math.floor(rand() * 6);
  const asOfMs = Date.parse(`${STUDY_AS_OF}T00:00:00Z`);
  const accounts = ['Zerodha', 'Groww', 'HDFC Securities'].slice(0, 1 + Math.floor(rand() * 3));
  const assets: RebalanceAsset[] = [];
  const kinds: Array<{ category: TaxCategory; vol: number; beta: number }> = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    const kind: (typeof kinds)[number] =
      r < 0.7 ? { category: 'equity', vol: 0.1 + rand() * 0.15, beta: 0.6 + rand() * 0.6 } : r < 0.85 ? { category: 'gold_etf', vol: 0.15, beta: 0 } : { category: 'debt_fund', vol: 0.03, beta: 0 };
    kinds.push(kind);
    const price = 100;
    const lots = [];
    const lotCount = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < lotCount; k++) {
      const daysAgo = 20 + Math.floor(rand() * 1440);
      lots.push({
        id: `${seed}-${i}-${k}`,
        account: accounts[Math.floor(rand() * accounts.length)],
        purchaseDate: iso(asOfMs - daysAgo * 86_400_000),
        units: Math.round(50 + rand() * 950),
        // Older lots tend to have larger gains; every lot gets noise so some sit at a loss.
        costPerUnit: price * Math.exp(-0.1 * (daysAgo / 365) + 0.3 * normal(rand)),
      });
    }
    const value = lots.reduce((s, l) => s + l.units * price, 0);
    assets.push({ symbol: `A${i + 1}`, name: `Asset ${i + 1}`, category: kind.category, price, value, lots });
  }
  // One-factor covariance: equity loads on the market (18% vol); gold and debt are independent.
  const marketVar = 0.18 ** 2;
  const cov = kinds.map((a, i) => kinds.map((b, j) => a.beta * b.beta * marketVar + (i === j ? a.vol ** 2 : 0)));
  const raw = assets.map(() => Math.exp(0.8 * normal(rand)));
  const sum = raw.reduce((s, x) => s + x, 0);
  return {
    assets,
    target: raw.map((x) => x / sum),
    cov,
    asOf: STUDY_AS_OF,
    tax: { slabRate: rand() < 0.5 ? 0.2 : 0.3 },
    resolution: 100,
  };
}

export function runTrial(seed: number): StudyTrial | null {
  const input = syntheticCase(seed);
  const r = rebalancePath(input);
  if (r.te0 <= 1e-6) return null;
  const end = r.smart[r.smart.length - 1];
  const goal = r.te0 - 0.9 * (r.te0 - end.te);
  const at90 = r.smart.find((p) => p.te <= goal + 1e-12) ?? end;
  const naive90 = naiveCostAt(r, at90.te);
  if (!naive90) return null;
  const naiveFull = r.naive[r.naive.length - 1];
  return {
    seed,
    assets: input.assets.length,
    value: r.total,
    smart90: { tax: at90.tax, cost: at90.cost },
    naive90: { tax: naive90.tax, cost: naive90.cost },
    smartFull: { tax: end.tax, cost: end.cost },
    naiveFull: { tax: naiveFull.tax, cost: naiveFull.cost },
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarise(trials: StudyTrial[]): StudySummary {
  // Saving as a share of the naive tax, over trials where the naive plan pays some tax.
  const taxed = trials.filter((t) => t.naive90.tax > 1);
  const saved = taxed.map((t) => (t.naive90.tax - t.smart90.tax) / t.naive90.tax);
  const costSaved = trials.filter((t) => t.naive90.cost > 1).map((t) => (t.naive90.cost - t.smart90.cost) / t.naive90.cost);
  const sum = (f: (t: StudyTrial) => number) => trials.reduce((s, t) => s + f(t), 0);
  return {
    trials: trials.length,
    smartNoWorse90: trials.length ? trials.filter((t) => t.smart90.cost <= t.naive90.cost + 1).length / trials.length : 0,
    medianTaxSaved90Pct: median(saved) * 100,
    meanTaxSaved90Pct: saved.length ? (saved.reduce((s, x) => s + x, 0) / saved.length) * 100 : 0,
    totalTaxSmart90: sum((t) => t.smart90.tax),
    totalTaxNaive90: sum((t) => t.naive90.tax),
    medianCostSaved90Pct: median(costSaved) * 100,
    totalTaxSmartFull: sum((t) => t.smartFull.tax),
    totalTaxNaiveFull: sum((t) => t.naiveFull.tax),
    zeroTaxSmart90: trials.filter((t) => t.smart90.tax <= 1).length,
    worseMedianExtra: median(trials.filter((t) => t.smart90.cost > t.naive90.cost + 1).map((t) => t.smart90.cost - t.naive90.cost)),
  };
}

export function runStudy(count = 200, firstSeed = 1): { trials: StudyTrial[]; summary: StudySummary } {
  const trials: StudyTrial[] = [];
  for (let s = firstSeed; s < firstSeed + count; s++) {
    const t = runTrial(s);
    if (t) trials.push(t);
  }
  return { trials, summary: summarise(trials) };
}
