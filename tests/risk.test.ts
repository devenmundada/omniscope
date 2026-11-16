import { describe, expect, it } from 'vitest';
import {
  alignedReturns,
  computeRiskMetrics,
  factorBetas,
  ledoitWolf,
  riskContributions,
  sampleCovariance,
  blendedExpectedReturns,
  quantile,
} from '@/lib/math/risk';
import {
  efficientFrontier,
  minimumVariance,
  mulberry32,
  projectCappedSimplex,
  rebalanceTrades,
  solveMeanVariance,
  stressTest,
} from '@/lib/math/optimizer';

const rand = mulberry32(42);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

describe('data preparation', () => {
  it('forward-fills onto the calendar and cleans a bonus day', () => {
    const { dates, returns } = alignedReturns(
      ['d1', 'd2', 'd3', 'd4'],
      [
        [{ date: 'd1', close: 100 }, { date: 'd2', close: 110 }, { date: 'd4', close: 121 }], // no d3 price
        [{ date: 'd1', close: 2000 }, { date: 'd2', close: 1000 }, { date: 'd3', close: 1010 }, { date: 'd4', close: 1010 }], // 1:1 bonus on d2
      ]
    );
    expect(dates).toEqual(['d2', 'd3', 'd4']);
    expect(returns[0][0]).toBeCloseTo(0.1);
    expect(returns[1][0]).toBe(0); // forward-filled
    expect(returns[2][0]).toBeCloseTo(0.1);
    expect(returns[0][1]).toBeCloseTo(0); // bonus removed, not a 50% crash
    expect(returns[1][1]).toBeCloseTo(0.01);
  });
});

describe('risk metrics', () => {
  it('measures drawdown, VaR and the worst day', () => {
    const daily = [0.1, -0.5, 0.2, 0.05];
    const m = computeRiskMetrics(['a', 'b', 'c', 'd'], daily, null);
    expect(m.maxDrawdown).toBeCloseTo(0.5); // 1.1 -> 0.55
    expect(m.maxDrawdownFrom).toBe('a');
    expect(m.maxDrawdownTo).toBe('b');
    expect(m.worstDay).toEqual({ date: 'b', return: -0.5 });
    expect(m.var95Daily).toBeCloseTo(-quantile(daily, 0.05));
  });

  it('recovers beta = 1 against itself and beta = 2 for a leveraged copy', () => {
    const bench = Array.from({ length: 300 }, () => 0.01 * gauss());
    const dates = bench.map((_, i) => `d${i}`);
    expect(computeRiskMetrics(dates, bench, bench).beta).toBeCloseTo(1, 6);
    expect(computeRiskMetrics(dates, bench.map((r) => 2 * r), bench).beta).toBeCloseTo(2, 6);
  });

  it('recovers two-factor betas exactly from noiseless data', () => {
    const eq = Array.from({ length: 200 }, () => 0.01 * gauss());
    const gold = Array.from({ length: 200 }, () => 0.008 * gauss());
    const asset = eq.map((e, i) => 0.0002 + 0.8 * e + 0.3 * gold[i]);
    const b = factorBetas(asset, eq, gold);
    expect(b.equity).toBeCloseTo(0.8, 8);
    expect(b.gold).toBeCloseTo(0.3, 8);
    expect(b.r2).toBeCloseTo(1, 8);
  });

  it('splits portfolio variance into contributions that sum to one', () => {
    const cov = [[0.04, 0.006], [0.006, 0.01]];
    const rc = riskContributions(cov, [0.5, 0.5]);
    expect(rc[0] + rc[1]).toBeCloseTo(1);
    expect(rc[0]).toBeGreaterThan(rc[1]); // the more volatile asset dominates
  });

  it('shrinks the covariance with Ledoit-Wolf and keeps it symmetric', () => {
    const returns = Array.from({ length: 60 }, () => Array.from({ length: 8 }, () => 0.01 * gauss()));
    const { cov, shrinkage } = ledoitWolf(returns);
    expect(shrinkage).toBeGreaterThan(0);
    expect(shrinkage).toBeLessThanOrEqual(1);
    expect(cov[2][5]).toBeCloseTo(cov[5][2], 12);
    // Off-diagonal entries move towards zero relative to the sample estimate.
    const s = sampleCovariance(returns);
    expect(Math.abs(cov[2][5])).toBeLessThan(Math.abs(s[2][5]));
  });

  it('shrinks expected returns towards the asset-class prior', () => {
    const returns = Array.from({ length: 252 }, () => [0.002, 0]); // ~50%/yr and 0%/yr
    const { mu, historyWeight } = blendedExpectedReturns(returns, [0.12, 0.07], 5);
    expect(historyWeight).toBeCloseTo(1 / 6);
    expect(mu[0]).toBeCloseTo((1 / 6) * 0.504 + (5 / 6) * 0.12, 6);
    expect(mu[1]).toBeCloseTo((5 / 6) * 0.07, 6);
  });
});

describe('optimizer', () => {
  it('projects onto the capped simplex', () => {
    const w = projectCappedSimplex([0.9, 0.5, -0.2, 0.1], 0.4);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Math.max(...w)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    expect(projectCappedSimplex([0.25, 0.25, 0.25, 0.25], 0.4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('matches the closed-form minimum-variance portfolio', () => {
    // Uncorrelated assets: w1 = s2^2 / (s1^2 + s2^2)
    const w = minimumVariance([[0.04, 0], [0, 0.01]]);
    expect(w[0]).toBeCloseTo(0.2, 4);
    expect(w[1]).toBeCloseTo(0.8, 4);
  });

  it('finds the tangency (maximum-Sharpe) portfolio', () => {
    // Uncorrelated: w_i proportional to (mu_i - rf) / s_i^2 -> (0.06/0.04, 0.03/0.01) = (1.5, 3) -> (1/3, 2/3)
    const f = efficientFrontier([0.12, 0.09], [[0.04, 0], [0, 0.01]], 0.06);
    expect(f.maxSharpe.weights[0]).toBeCloseTo(1 / 3, 2);
    expect(f.maxSharpe.weights[1]).toBeCloseTo(2 / 3, 2);
    // Frontier points rise in both risk and return.
    for (let i = 1; i < f.points.length; i++) {
      expect(f.points[i].volatility).toBeGreaterThan(f.points[i - 1].volatility);
      expect(f.points[i].expectedReturn).toBeGreaterThan(f.points[i - 1].expectedReturn);
    }
  });

  it('respects the per-asset cap', () => {
    const w = solveMeanVariance([0.3, 0.1, 0.08], [[0.04, 0, 0], [0, 0.02, 0], [0, 0, 0.01]], 0.5, 0.4);
    expect(Math.max(...w)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('builds rebalancing trades', () => {
    const trades = rebalanceTrades([60_000, 40_000], [0.5, 0.5]);
    expect(trades).toEqual([{ index: 0, amount: -10_000 }, { index: 1, amount: 10_000 }]);
  });

  it('stress-tests holdings through their factor betas', () => {
    const r = stressTest([100_000, 50_000], [{ equity: 1.2, gold: 0 }, { equity: 0, gold: 1 }], { equity: -0.3, gold: 0.1 }, 0.1);
    expect(r.moves[0]).toBeCloseTo(-0.36);
    expect(r.pnl).toBeCloseTo(-36_000 + 5_000);
    expect(r.portfolioMove).toBeCloseTo(-31_000 / 150_000);
    expect(r.recoveryYears).toBeCloseTo(Math.log(1 / (1 - 31 / 150)) / Math.log(1.1), 6);
  });
});
