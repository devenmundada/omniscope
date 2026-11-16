import { describe, expect, it } from 'vitest';
import { simulateGoal, blendPortfolioStats } from '@/lib/math/monte-carlo';

const base = { currentCorpus: 200000, monthlyContribution: 15000, months: 62, target: 1500000, annualReturn: 0.11, annualVolatility: 0.16 };

describe('simulateGoal', () => {
  it('is deterministic for the same seed', () => {
    const a = simulateGoal({ ...base, paths: 2000, seed: 7 });
    const b = simulateGoal({ ...base, paths: 2000, seed: 7 });
    expect(a.probabilityOfSuccess).toBe(b.probabilityOfSuccess);
    expect(a.p50).toBe(b.p50);
  });

  it('orders percentiles p10 <= p50 <= p90', () => {
    const r = simulateGoal({ ...base, paths: 5000, seed: 1 });
    expect(r.p10).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
    expect(r.probabilityOfSuccess).toBeGreaterThan(0);
    expect(r.probabilityOfSuccess).toBeLessThan(1);
  });

  it('median is close to the deterministic projection', () => {
    const r = simulateGoal({ ...base, annualVolatility: 0.0001, paths: 500, seed: 3 });
    let v = base.currentCorpus;
    for (let m = 0; m < base.months; m++) v = v * Math.exp(base.annualReturn / 12) + base.monthlyContribution;
    expect(Math.abs(r.p50 - v) / v).toBeLessThan(0.03);
  });

  it('more saving never lowers the probability', () => {
    const lo = simulateGoal({ ...base, paths: 4000, seed: 9 });
    const hi = simulateGoal({ ...base, monthlyContribution: 25000, paths: 4000, seed: 9 });
    expect(hi.probabilityOfSuccess).toBeGreaterThanOrEqual(lo.probabilityOfSuccess);
  });
});

describe('blendPortfolioStats', () => {
  it('diversification lowers volatility below the weighted average', () => {
    const r = blendPortfolioStats([
      { weight: 0.5, annualReturn: 0.12, annualVolatility: 0.2 },
      { weight: 0.5, annualReturn: 0.08, annualVolatility: 0.14 },
    ]);
    expect(r.annualReturn).toBeCloseTo(0.1, 5);
    expect(r.annualVolatility).toBeLessThan(0.17);
  });
});
