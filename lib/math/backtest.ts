/**
 * Walk-forward backtest of portfolio construction rules. Pure functions: no I/O.
 *
 * At each rebalance date t a strategy sees only the `trainDays` daily returns before t, chooses
 * target weights, pays a proportional cost on the traded amount, then holds (weights drift with
 * prices) until the next rebalance. Nothing after t is ever visible to the strategy, so every
 * result is out-of-sample.
 */
import { blendedExpectedReturns, computeRiskMetrics, ledoitWolf, TRADING_DAYS, type Matrix } from './risk';
import { evaluate, minimumVariance, solveMeanVariance } from './optimizer';

export interface StrategyContext {
  /** Daily returns available at the rebalance (most recent `trainDays` rows). */
  window: Matrix;
  /** Index of the rebalance day in the full return series (for tests). */
  t: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  target: (ctx: StrategyContext) => number[];
}

export interface BacktestOptions {
  trainDays?: number;
  rebalanceDays?: number;
  /** One-way cost as a fraction of the amount traded (0.001 = 0.1%). */
  costRate?: number;
  riskFree?: number;
}

export interface StrategyResult {
  id: string;
  name: string;
  description: string;
  curve: Array<{ date: string; value: number }>;
  cagr: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  /** Average one-way turnover per year (1 = the whole portfolio traded once a year). */
  annualTurnover: number;
  costsPaid: number;
  finalValue: number;
}

export interface BacktestResult {
  from: string;
  to: string;
  years: number;
  rebalances: number;
  trainDays: number;
  rebalanceDays: number;
  costRate: number;
  strategies: StrategyResult[];
}

/** Fast maximum-Sharpe search over a grid of risk-aversion levels (no golden-section refinement). */
export function maxSharpeWeights(mu: number[], cov: Matrix, riskFree: number, cap: number): number[] {
  let best = evaluate(minimumVariance(cov, cap), mu, cov, riskFree);
  for (let k = 0; k < 14; k++) {
    const gamma = 10 ** (3 - (4.5 * k) / 13);
    const p = evaluate(solveMeanVariance(mu, cov, gamma, cap, 300), mu, cov, riskFree);
    if (p.sharpe > best.sharpe) best = p;
  }
  return best.weights;
}

/** The standard strategy set: the user's current mix, equal weight, minimum variance and maximum Sharpe. */
export function standardStrategies(currentWeights: number[], priors: number[], riskFree: number, cap = 0.35): Strategy[] {
  const n = currentWeights.length;
  const annualCov = (window: Matrix) => ledoitWolf(window).cov.map((row) => row.map((v) => v * TRADING_DAYS));
  return [
    {
      id: 'current',
      name: 'Your current mix',
      description: 'Today’s weights, rebalanced back to them every month.',
      target: () => currentWeights,
    },
    {
      id: 'equal',
      name: 'Equal weight',
      description: 'The same amount in every holding: the classic hard-to-beat baseline.',
      target: () => new Array(n).fill(1 / n),
    },
    {
      id: 'minvar',
      name: 'Minimum variance',
      description: `The lowest-risk mix from the past year’s shrunk covariance, at most ${Math.round(cap * 100)}% per holding.`,
      target: ({ window }) => minimumVariance(annualCov(window), cap),
    },
    {
      id: 'maxsharpe',
      name: 'Optimiser (max Sharpe)',
      description: `Markowitz maximum-Sharpe mix from the past year, returns shrunk to long-run priors, at most ${Math.round(cap * 100)}% per holding.`,
      target: ({ window }) => maxSharpeWeights(blendedExpectedReturns(window, priors).mu, annualCov(window), riskFree, cap),
    },
  ];
}

export function runBacktest(
  dates: string[],
  returns: Matrix,
  benchmark: number[],
  strategies: Strategy[],
  opts: BacktestOptions = {}
): BacktestResult {
  const trainDays = opts.trainDays ?? TRADING_DAYS;
  const rebalanceDays = opts.rebalanceDays ?? 21;
  const costRate = opts.costRate ?? 0.001;
  const riskFree = opts.riskFree ?? 0.06;
  const T = returns.length;
  if (T <= trainDays + 21) throw new Error('Not enough history for a walk-forward backtest');
  const testDates = dates.slice(trainDays);
  const years = testDates.length / TRADING_DAYS;
  let rebalances = 0;

  const results: StrategyResult[] = strategies.map((s) => {
    const n = returns[0].length;
    let w = new Array(n).fill(0);
    let value = 1;
    let turnover = 0;
    let costs = 0;
    const daily: number[] = [];
    const curve: Array<{ date: string; value: number }> = [];
    let count = 0;
    for (let t = trainDays; t < T; t++) {
      const start = value;
      if ((t - trainDays) % rebalanceDays === 0) {
        const target = s.target({ window: returns.slice(t - trainDays, t), t });
        const traded = target.reduce((a, x, i) => a + Math.abs(x - w[i]), 0);
        // The very first purchase is the initial investment, not a trading cost.
        if (t > trainDays) {
          turnover += traded / 2;
          const cost = value * traded * costRate;
          costs += cost;
          value -= cost;
        }
        w = [...target];
        count++;
      }
      const r = returns[t].reduce((a, x, i) => a + x * w[i], 0);
      value *= 1 + r;
      w = w.map((wi, i) => (1 + r !== 0 ? (wi * (1 + returns[t][i])) / (1 + r) : wi));
      daily.push(value / start - 1);
      curve.push({ date: dates[t], value });
    }
    rebalances = count;
    const m = computeRiskMetrics(testDates, daily, null, riskFree);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      curve,
      cagr: m.annualReturn,
      volatility: m.annualVolatility,
      sharpe: m.sharpe,
      maxDrawdown: m.maxDrawdown,
      annualTurnover: turnover / years,
      costsPaid: costs,
      finalValue: value,
    };
  });

  // Benchmark: buy and hold the Nifty 50 over the same test period.
  const bench = benchmark.slice(trainDays);
  let v = 1;
  const benchCurve = bench.map((r, i) => ({ date: testDates[i], value: (v *= 1 + r) }));
  const bm = computeRiskMetrics(testDates, bench, null, riskFree);
  results.push({
    id: 'nifty',
    name: 'Nifty 50',
    description: 'Buy and hold the index (Nippon India Nifty BeES).',
    curve: benchCurve,
    cagr: bm.annualReturn,
    volatility: bm.annualVolatility,
    sharpe: bm.sharpe,
    maxDrawdown: bm.maxDrawdown,
    annualTurnover: 0,
    costsPaid: 0,
    finalValue: v,
  });

  return { from: testDates[0], to: testDates[testDates.length - 1], years, rebalances, trainDays, rebalanceDays, costRate, strategies: results };
}
