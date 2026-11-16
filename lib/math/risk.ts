/**
 * Portfolio risk analytics on daily closing prices. Pure functions: no I/O, safe on server and client.
 *
 * Conventions: simple daily returns, 252 trading days a year, weights sum to 1.
 */
import { corporateActionFactor } from '@/lib/market-data/nse-history';

export const TRADING_DAYS = 252;
/** Annual risk-free rate used for Sharpe/Sortino/alpha (approximate Indian 91-day T-bill yield). */
export const RISK_FREE_RATE = 0.06;

export interface PricePoint {
  date: string;
  close: number;
}

export type Matrix = number[][];

// ---------- basic statistics ----------

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

export function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

/** Linear-interpolated quantile of an unsorted sample, q in [0, 1]. */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const column = (m: Matrix, j: number) => m.map((row) => row[j]);

export function matVec(m: Matrix, v: number[]): number[] {
  return m.map((row) => row.reduce((a, x, j) => a + x * v[j], 0));
}

export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

export const quadForm = (m: Matrix, w: number[]) => dot(w, matVec(m, w));

// ---------- data preparation ----------

/**
 * Forward-fills each price series onto a trading calendar and returns daily simple returns.
 * Returns start on the first calendar date where every series has a price. One-day ratios that
 * look like a bonus or split are cleaned (see corporateActionFactor).
 */
export function alignedReturns(calendar: string[], series: PricePoint[][]): { dates: string[]; returns: Matrix } {
  const filled = series.map((pts) => {
    const out: (number | null)[] = [];
    let j = 0;
    let last: number | null = null;
    for (const d of calendar) {
      while (j < pts.length && pts[j].date <= d) {
        last = pts[j].close;
        j++;
      }
      out.push(last);
    }
    return out;
  });
  const start = calendar.findIndex((_, t) => filled.every((f) => f[t] != null && (f[t] as number) > 0));
  if (start < 0) return { dates: [], returns: [] };
  const dates: string[] = [];
  const returns: Matrix = [];
  for (let t = start + 1; t < calendar.length; t++) {
    dates.push(calendar[t]);
    returns.push(
      filled.map((f) => {
        const raw = (f[t] as number) / (f[t - 1] as number);
        return raw / corporateActionFactor(raw) - 1;
      })
    );
  }
  return { dates, returns };
}

// ---------- covariance ----------

/** Sample covariance matrix of the columns of `returns` (T x N). */
export function sampleCovariance(returns: Matrix): Matrix {
  const n = returns[0]?.length ?? 0;
  const cols = Array.from({ length: n }, (_, j) => column(returns, j));
  return cols.map((ci, i) => cols.map((cj, j) => (j < i ? 0 : covariance(ci, cj)))).map((row, i, all) =>
    row.map((v, j) => (j < i ? all[j][i] : v))
  );
}

/**
 * Ledoit-Wolf (2004) shrinkage of the sample covariance towards a scaled identity:
 *   Sigma = delta * m * I + (1 - delta) * S,  delta = min(b^2, d^2) / d^2.
 * Shrinkage stabilises the optimiser when there are few observations per asset.
 */
export function ledoitWolf(returns: Matrix): { cov: Matrix; shrinkage: number } {
  const T = returns.length;
  const n = returns[0]?.length ?? 0;
  if (T < 2 || n === 0) return { cov: [], shrinkage: 0 };
  const means = Array.from({ length: n }, (_, j) => mean(column(returns, j)));
  const X = returns.map((row) => row.map((x, j) => x - means[j]));
  // Biased (1/T) sample covariance, as in the paper.
  const S: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const x of X) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i][j] += (x[i] * x[j]) / T;
  const m = S.reduce((a, row, i) => a + row[i], 0) / n;
  let d2 = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d2 += (S[i][j] - (i === j ? m : 0)) ** 2;
  d2 /= n;
  let bBar2 = 0;
  for (const x of X) {
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += (x[i] * x[j] - S[i][j]) ** 2;
    bBar2 += s / n;
  }
  bBar2 /= T * T;
  const b2 = Math.min(bBar2, d2);
  const delta = d2 > 0 ? b2 / d2 : 0;
  const cov = S.map((row, i) => row.map((v, j) => delta * (i === j ? m : 0) + (1 - delta) * v));
  return { cov, shrinkage: delta };
}

export function correlationFromCov(cov: Matrix): Matrix {
  const sd = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  return cov.map((row, i) => row.map((v, j) => (sd[i] > 0 && sd[j] > 0 ? v / (sd[i] * sd[j]) : i === j ? 1 : 0)));
}

// ---------- portfolio metrics ----------

export interface DrawdownPoint {
  date: string;
  value: number;
  drawdown: number;
}

export interface PortfolioRiskMetrics {
  observations: number;
  fromDate: string;
  toDate: string;
  /** Compound annual growth rate over the window. */
  annualReturn: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  maxDrawdownFrom: string;
  maxDrawdownTo: string;
  beta: number | null;
  alpha: number | null;
  correlationToBenchmark: number | null;
  trackingError: number | null;
  benchmarkAnnualReturn: number | null;
  /** Losses as positive fractions of portfolio value, 95% confidence. */
  var95Daily: number;
  cvar95Daily: number;
  var95Monthly: number;
  cvar95Monthly: number;
  parametricVar95Monthly: number;
  worstDay: { date: string; return: number };
  bestDay: { date: string; return: number };
  underwater: DrawdownPoint[];
}

const annualise = (dailyMean: number) => dailyMean * TRADING_DAYS;

export function cagr(daily: number[]): number {
  if (daily.length === 0) return 0;
  const growth = daily.reduce((g, r) => g * (1 + r), 1);
  return growth > 0 ? growth ** (TRADING_DAYS / daily.length) - 1 : -1;
}

/** Overlapping k-day compounded returns. */
export function rollingReturns(daily: number[], k: number): number[] {
  const out: number[] = [];
  for (let t = 0; t + k <= daily.length; t++) {
    let g = 1;
    for (let s = t; s < t + k; s++) g *= 1 + daily[s];
    out.push(g - 1);
  }
  return out;
}

export function portfolioReturns(returns: Matrix, weights: number[]): number[] {
  return returns.map((row) => dot(row, weights));
}

export function computeRiskMetrics(
  dates: string[],
  daily: number[],
  benchmark: number[] | null,
  riskFree = RISK_FREE_RATE
): PortfolioRiskMetrics {
  const T = daily.length;
  const annualReturn = cagr(daily);
  const annualVolatility = Math.sqrt(variance(daily) * TRADING_DAYS);
  const rfDaily = (1 + riskFree) ** (1 / TRADING_DAYS) - 1;
  const downside = Math.sqrt(mean(daily.map((r) => Math.min(0, r - rfDaily) ** 2)) * TRADING_DAYS);

  // Drawdown path of a growth-of-1 index.
  let value = 1;
  let peak = 1;
  let peakDate = dates[0] ?? '';
  let maxDd = 0;
  let ddFrom = peakDate;
  let ddTo = peakDate;
  const underwater: DrawdownPoint[] = [];
  daily.forEach((r, t) => {
    value *= 1 + r;
    if (value > peak) {
      peak = value;
      peakDate = dates[t];
    }
    const dd = value / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      ddFrom = peakDate;
      ddTo = dates[t];
    }
    underwater.push({ date: dates[t], value, drawdown: dd });
  });

  let beta: number | null = null;
  let alpha: number | null = null;
  let corr: number | null = null;
  let te: number | null = null;
  let benchAnnual: number | null = null;
  if (benchmark && benchmark.length === T && T > 2) {
    const vb = variance(benchmark);
    if (vb > 0) {
      beta = covariance(daily, benchmark) / vb;
      benchAnnual = cagr(benchmark);
      alpha = annualReturn - (riskFree + beta * (benchAnnual - riskFree));
      const vp = variance(daily);
      corr = vp > 0 ? covariance(daily, benchmark) / Math.sqrt(vp * vb) : null;
      te = Math.sqrt(variance(daily.map((r, i) => r - benchmark[i])) * TRADING_DAYS);
    }
  }

  const q = quantile(daily, 0.05);
  const tail = daily.filter((r) => r <= q);
  const monthly = rollingReturns(daily, 21);
  const qm = quantile(monthly, 0.05);
  const tailM = monthly.filter((r) => r <= qm);
  const sigmaM = Math.sqrt(variance(daily) * 21);
  let worst = 0;
  let best = 0;
  daily.forEach((r, t) => {
    if (r < daily[worst]) worst = t;
    if (r > daily[best]) best = t;
  });

  return {
    observations: T,
    fromDate: dates[0] ?? '',
    toDate: dates[T - 1] ?? '',
    annualReturn,
    annualVolatility,
    sharpe: annualVolatility > 0 ? (annualReturn - riskFree) / annualVolatility : 0,
    sortino: downside > 0 ? (annualReturn - riskFree) / downside : 0,
    maxDrawdown: -maxDd,
    maxDrawdownFrom: ddFrom,
    maxDrawdownTo: ddTo,
    beta,
    alpha,
    correlationToBenchmark: corr,
    trackingError: te,
    benchmarkAnnualReturn: benchAnnual,
    var95Daily: Math.max(0, -q),
    cvar95Daily: Math.max(0, -mean(tail)),
    var95Monthly: Math.max(0, -qm),
    cvar95Monthly: Math.max(0, -mean(tailM)),
    parametricVar95Monthly: Math.max(0, 1.6449 * sigmaM - mean(daily) * 21),
    worstDay: { date: dates[worst] ?? '', return: daily[worst] ?? 0 },
    bestDay: { date: dates[best] ?? '', return: daily[best] ?? 0 },
    underwater,
  };
}

/** Share of portfolio variance contributed by each asset (Euler decomposition); sums to 1. */
export function riskContributions(cov: Matrix, weights: number[]): number[] {
  const sw = matVec(cov, weights);
  const total = dot(weights, sw);
  return weights.map((w, i) => (total > 0 ? (w * sw[i]) / total : 0));
}

/**
 * Two-factor regression r_i = a + b_eq * r_equity + b_gold * r_gold + e, by ordinary least squares.
 * Used to translate market scenarios (an equity crash, a gold move) into each holding's move.
 */
export function factorBetas(asset: number[], equity: number[], gold: number[]): { equity: number; gold: number; r2: number } {
  const n = Math.min(asset.length, equity.length, gold.length);
  if (n < 10) return { equity: 0, gold: 0, r2: 0 };
  const y = asset.slice(0, n);
  const x1 = equity.slice(0, n);
  const x2 = gold.slice(0, n);
  const s11 = covariance(x1, x1);
  const s22 = covariance(x2, x2);
  const s12 = covariance(x1, x2);
  const s1y = covariance(x1, y);
  const s2y = covariance(x2, y);
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-18) {
    const b = s11 > 0 ? s1y / s11 : 0;
    return { equity: b, gold: 0, r2: 0 };
  }
  const b1 = (s1y * s22 - s2y * s12) / det;
  const b2 = (s2y * s11 - s1y * s12) / det;
  const vy = covariance(y, y);
  const explained = b1 * s1y + b2 * s2y;
  return { equity: b1, gold: b2, r2: vy > 0 ? Math.min(1, Math.max(0, explained / vy)) : 0 };
}

/**
 * Expected annual returns for the optimiser: historical means shrunk towards long-run
 * asset-class returns. The prior counts as `priorYears` of data, so two years of history get a
 * weight of 2 / (2 + priorYears). Raw historical means are far too noisy to optimise on.
 */
export function blendedExpectedReturns(returns: Matrix, priors: number[], priorYears = 5): { mu: number[]; historyWeight: number } {
  const T = returns.length;
  const years = T / TRADING_DAYS;
  const historyWeight = years / (years + priorYears);
  const mu = priors.map((p, j) => historyWeight * annualise(mean(column(returns, j))) + (1 - historyWeight) * p);
  return { mu, historyWeight };
}
