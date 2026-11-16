/**
 * Long-only mean-variance optimisation (Markowitz) with a per-asset cap, plus stress testing.
 * Pure functions: no I/O, safe on server and client.
 *
 * Each frontier portfolio solves   max_w  mu'w - (gamma / 2) w' Sigma w
 *                                  s.t.   sum(w) = 1,  0 <= w_i <= cap
 * by accelerated projected gradient ascent (FISTA). Sweeping gamma traces the efficient frontier.
 */
import { dot, matVec, quadForm, type Matrix } from './risk';

/** Euclidean projection onto { w : sum(w) = 1, 0 <= w_i <= cap } by bisection on the shift tau. */
export function projectCappedSimplex(v: number[], cap = 1): number[] {
  const n = v.length;
  const c = Math.max(cap, 1 / n); // a cap below 1/n is infeasible
  const sumAt = (tau: number) => v.reduce((s, x) => s + Math.min(c, Math.max(0, x - tau)), 0);
  let lo = Math.min(...v) - c;
  let hi = Math.max(...v);
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (sumAt(mid) > 1) lo = mid;
    else hi = mid;
  }
  const tau = (lo + hi) / 2;
  const w = v.map((x) => Math.min(c, Math.max(0, x - tau)));
  const s = w.reduce((a, b) => a + b, 0);
  return s > 0 ? w.map((x) => x / s) : v.map(() => 1 / n);
}

/** Largest eigenvalue of a symmetric PSD matrix (power iteration). */
export function largestEigenvalue(m: Matrix): number {
  const n = m.length;
  let v = new Array(n).fill(1 / Math.sqrt(n));
  let lambda = 0;
  for (let k = 0; k < 100; k++) {
    const mv = matVec(m, v);
    const norm = Math.sqrt(dot(mv, mv));
    if (norm === 0) return 0;
    v = mv.map((x) => x / norm);
    lambda = norm;
  }
  return lambda;
}

export function solveMeanVariance(mu: number[], cov: Matrix, gamma: number, cap = 1, iterations = 600): number[] {
  const n = mu.length;
  const L = Math.max(gamma * largestEigenvalue(cov), 1e-6);
  let w = projectCappedSimplex(new Array(n).fill(1 / n), cap);
  let y = [...w];
  let t = 1;
  for (let k = 0; k < iterations; k++) {
    const sy = matVec(cov, y);
    const grad = mu.map((m, i) => m - gamma * sy[i]);
    const next = projectCappedSimplex(y.map((x, i) => x + grad[i] / L), cap);
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    y = next.map((x, i) => x + ((t - 1) / tNext) * (x - w[i]));
    const moved = next.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
    w = next;
    t = tNext;
    if (moved < 1e-10) break;
  }
  return w;
}

export interface FrontierPoint {
  weights: number[];
  expectedReturn: number;
  volatility: number;
  sharpe: number;
}

export function evaluate(weights: number[], mu: number[], cov: Matrix, riskFree: number): FrontierPoint {
  const expectedReturn = dot(weights, mu);
  const volatility = Math.sqrt(Math.max(quadForm(cov, weights), 0));
  return { weights, expectedReturn, volatility, sharpe: volatility > 0 ? (expectedReturn - riskFree) / volatility : 0 };
}

/** Minimum-variance portfolio (gamma large, returns ignored). */
export function minimumVariance(cov: Matrix, cap = 1): number[] {
  return solveMeanVariance(new Array(cov.length).fill(0), cov, 1, cap, 2000);
}

export interface Frontier {
  points: FrontierPoint[];
  minVariance: FrontierPoint;
  maxSharpe: FrontierPoint;
}

/** Efficient frontier from minimum variance to maximum return, with the maximum-Sharpe portfolio. */
export function efficientFrontier(mu: number[], cov: Matrix, riskFree: number, cap = 1, count = 36): Frontier {
  const minVariance = evaluate(minimumVariance(cov, cap), mu, cov, riskFree);
  const raw: FrontierPoint[] = [minVariance];
  for (let k = 0; k < count; k++) {
    const gamma = 10 ** (3 - (4.5 * k) / (count - 1)); // 1000 -> ~0.03
    raw.push(evaluate(solveMeanVariance(mu, cov, gamma, cap), mu, cov, riskFree));
  }
  // Keep the efficient (upper) branch: return must rise with volatility.
  raw.sort((a, b) => a.volatility - b.volatility);
  const points: FrontierPoint[] = [];
  for (const p of raw) {
    const last = points[points.length - 1];
    if (!last || (p.expectedReturn > last.expectedReturn + 1e-6 && p.volatility > last.volatility + 1e-6)) points.push(p);
  }

  // Maximum Sharpe: best frontier point, refined by golden-section search on log(gamma).
  let best = points.reduce((a, b) => (b.sharpe > a.sharpe ? b : a), points[0]);
  const sharpeAt = (logG: number) => evaluate(solveMeanVariance(mu, cov, 10 ** logG, cap), mu, cov, riskFree);
  let lo = -2;
  let hi = 3.5;
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = sharpeAt(x1);
  let f2 = sharpeAt(x2);
  for (let k = 0; k < 30; k++) {
    if (f1.sharpe > f2.sharpe) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = sharpeAt(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = sharpeAt(x2);
    }
  }
  const refined = f1.sharpe > f2.sharpe ? f1 : f2;
  if (refined.sharpe > best.sharpe) best = refined;
  return { points, minVariance, maxSharpe: best };
}

/** Deterministic PRNG so the random-portfolio cloud is stable between renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniformly random long-only portfolios (Dirichlet(1)) for the risk/return scatter. */
export function randomPortfolios(mu: number[], cov: Matrix, riskFree: number, count = 1500, seed = 7): Array<{ expectedReturn: number; volatility: number; sharpe: number }> {
  const rand = mulberry32(seed);
  const out: Array<{ expectedReturn: number; volatility: number; sharpe: number }> = [];
  for (let k = 0; k < count; k++) {
    const e = mu.map(() => -Math.log(1 - rand()));
    const s = e.reduce((a, b) => a + b, 0);
    const p = evaluate(e.map((x) => x / s), mu, cov, riskFree);
    out.push({ expectedReturn: p.expectedReturn, volatility: p.volatility, sharpe: p.sharpe });
  }
  return out;
}

// ---------- rebalancing ----------

export interface Trade {
  index: number;
  amount: number; // + buy, - sell (INR)
}

/** Trades that move current values to target weights, rounded to the nearest rupee step. */
export function rebalanceTrades(currentValues: number[], targetWeights: number[], minTrade = 500): Trade[] {
  const total = currentValues.reduce((a, b) => a + b, 0);
  return currentValues
    .map((v, index) => ({ index, amount: Math.round((targetWeights[index] * total - v) / 100) * 100 }))
    .filter((t) => Math.abs(t.amount) >= minTrade)
    .sort((a, b) => a.amount - b.amount);
}

// ---------- stress testing ----------

export interface ScenarioShock {
  equity: number; // e.g. -0.38 for a 38% fall in the Nifty 50
  gold: number; // e.g. 0.05 for a 5% rise in gold
}

export interface StressResult {
  /** Fractional move of each holding. */
  moves: number[];
  /** Change in portfolio value (INR). */
  pnl: number;
  /** Fractional move of the whole portfolio. */
  portfolioMove: number;
  /** Years to recover a loss at the expected return, or null if there is no loss / no growth. */
  recoveryYears: number | null;
}

/** Linear two-factor stress: each holding moves by beta_eq * equity shock + beta_gold * gold shock. */
export function stressTest(values: number[], betas: Array<{ equity: number; gold: number }>, shock: ScenarioShock, expectedAnnualReturn: number): StressResult {
  const moves = betas.map((b) => Math.max(-1, b.equity * shock.equity + b.gold * shock.gold));
  const total = values.reduce((a, b) => a + b, 0);
  const pnl = values.reduce((s, v, i) => s + v * moves[i], 0);
  const portfolioMove = total > 0 ? pnl / total : 0;
  const recoveryYears =
    portfolioMove < 0 && expectedAnnualReturn > 0 ? Math.log(1 / (1 + portfolioMove)) / Math.log(1 + expectedAnnualReturn) : null;
  return { moves, pnl, portfolioMove, recoveryYears };
}

export interface NamedScenario {
  id: string;
  name: string;
  period: string;
  shock: ScenarioShock;
  note: string;
}

/** Approximate peak-to-trough Nifty 50 falls; gold moves are rounded assumptions the user can edit. */
export const HISTORICAL_SCENARIOS: NamedScenario[] = [
  { id: 'gfc', name: 'Global Financial Crisis', period: 'Jan–Oct 2008', shock: { equity: -0.6, gold: 0.1 }, note: 'Nifty 50 fell about 60% from its January peak as global credit markets froze.' },
  { id: 'covid', name: 'COVID-19 crash', period: 'Jan–Mar 2020', shock: { equity: -0.38, gold: 0.05 }, note: 'Nifty 50 fell about 38% in nine weeks before a rapid recovery.' },
  { id: 'rates', name: 'Rate-hike sell-off', period: 'Oct 2021–Jun 2022', shock: { equity: -0.17, gold: 0.05 }, note: 'Global central banks raised rates sharply; Nifty 50 fell about 17%.' },
  { id: 'gold', name: 'Gold correction', period: 'Hypothetical', shock: { equity: 0, gold: -0.2 }, note: 'Gold gives back 20% after a strong rally while shares stay flat.' },
];
