import { describe, expect, it } from 'vitest';
import { activeRisk, naiveCostAt, rebalancePath, rebalancePlan, type RebalanceInput } from '@/lib/math/rebalance';

const cov = [
  [0.04, 0.01],
  [0.01, 0.02],
];
const opts = { slabRate: 0.2 };

/** Equity fund overweight (80% vs 50% target) held in two accounts with very different tax positions. */
function twoAccounts(): RebalanceInput {
  return {
    asOf: '2026-11-17',
    tax: opts,
    cov,
    target: [0.5, 0.5],
    assets: [
      {
        symbol: 'EQ',
        name: 'Equity fund',
        category: 'equity',
        price: 100,
        value: 80_000,
        lots: [
          // Old lot in account A: a large long-term gain.
          { id: 'a1', account: 'A', purchaseDate: '2021-01-01', units: 400, costPerUnit: 10 },
          // Recent lot in account B: bought above today's price, so a loss.
          { id: 'b1', account: 'B', purchaseDate: '2026-06-01', units: 400, costPerUnit: 120 },
        ],
      },
      { symbol: 'GOLD', name: 'Gold ETF', category: 'gold_etf', price: 50, value: 20_000, lots: [{ id: 'g1', account: 'A', purchaseDate: '2024-01-01', units: 400, costPerUnit: 45 }] },
    ],
  };
}

describe('tax-aware rebalancing', () => {
  it('reaches the target and measures active risk with the covariance', () => {
    const input = twoAccounts();
    const r = rebalancePath(input);
    expect(r.te0).toBeCloseTo(activeRisk(cov, [0.8, 0.2], [0.5, 0.5]), 10);
    const end = r.smart[r.smart.length - 1];
    expect(end.te).toBeLessThan(r.te0 * 0.02);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.weights[0]).toBeCloseTo(0.5, 2);
    expect(plan.trades[0]).toBeCloseTo(-30_000, -3);
  });

  it('sells the loss-making lot in the other account instead of the oldest units', () => {
    // The ₹1.25 lakh exemption is already used this year, so long-term gains are taxed.
    const input = { ...twoAccounts(), tax: { slabRate: 0.2, ltcgAlreadyBooked: 125_000 } };
    const r = rebalancePath(input);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.sales.every((s) => s.account === 'B')).toBe(true);
    expect(plan.extraTax).toBe(0);
    // Selling oldest-first across accounts would book part of the huge long-term gain instead.
    const naiveFull = r.naive[20];
    expect(naiveFull.tax).toBeCloseTo(300 * 90 * 0.125 * 1.04, 0);
    expect(naiveFull.te).toBeCloseTo(0, 10);
  });

  it('invests new cash first, with no tax, when cash alone can close the gap', () => {
    const input = { ...twoAccounts(), cash: 60_000 };
    const r = rebalancePath(input);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.sales).toEqual([]);
    expect(plan.extraTax).toBe(0);
    expect(plan.trades[1]).toBeCloseTo(60_000, -2);
    expect(plan.weights[1]).toBeCloseTo(0.5, 2);
  });

  it('makes the naive path linear in active risk and lets the smart path beat it at equal risk', () => {
    const input = twoAccounts();
    const r = rebalancePath(input);
    r.naive.forEach((p) => expect(p.te).toBeCloseTo((1 - p.alpha) * r.te0, 10));
    const rec = r.smart[r.recommendedStep];
    expect(1 - rec.te / r.te0).toBeGreaterThanOrEqual(0.9 * (1 - r.smart[r.smart.length - 1].te / r.te0) - 1e-9);
    expect(rec.tax).toBeLessThanOrEqual(naiveCostAt(r, rec.te)!.tax + 1e-6);
  });

  it('prefers gains inside the exemption to short-term gains', () => {
    const input: RebalanceInput = {
      asOf: '2026-11-17',
      tax: opts,
      cov,
      target: [0.5, 0.5],
      assets: [
        {
          symbol: 'EQ',
          name: 'Equity fund',
          category: 'equity',
          price: 100,
          value: 80_000,
          lots: [
            { id: 's1', account: 'A', purchaseDate: '2026-09-01', units: 400, costPerUnit: 60 },
            { id: 'l1', account: 'B', purchaseDate: '2024-01-01', units: 400, costPerUnit: 60 },
          ],
        },
        { symbol: 'GOLD', name: 'Gold ETF', category: 'gold_etf', price: 50, value: 20_000, lots: [{ id: 'g1', account: 'A', purchaseDate: '2024-01-01', units: 400, costPerUnit: 45 }] },
      ],
    };
    const r = rebalancePath(input);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.sales.map((s) => s.account)).toEqual(['B']);
    expect(plan.sales[0].term).toBe('long');
    expect(plan.extraTax).toBe(0); // ₹12,000 of long-term gain sits inside the ₹1.25 lakh exemption
  });

  it('flags short-term gains that turn long-term soon', () => {
    const input: RebalanceInput = {
      asOf: '2026-11-17',
      tax: opts,
      cov,
      target: [0.5, 0.5],
      assets: [
        { symbol: 'EQ', name: 'Equity fund', category: 'equity', price: 100, value: 80_000, lots: [{ id: 's1', account: 'A', purchaseDate: '2025-12-01', units: 800, costPerUnit: 50 }] },
        { symbol: 'GOLD', name: 'Gold ETF', category: 'gold_etf', price: 50, value: 20_000, lots: [{ id: 'g1', account: 'A', purchaseDate: '2024-01-01', units: 400, costPerUnit: 45 }] },
      ],
    };
    const r = rebalancePath(input);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.waits).toHaveLength(1);
    expect(plan.waits[0]).toMatchObject({ symbol: 'EQ', longTermOn: '2026-12-02', days: 15 });
    // ₹15,000 short-term gain at 20% + cess, versus nothing once long-term (inside the exemption).
    expect(plan.waits[0].saving).toBeCloseTo(15_000 * 0.2 * 1.04, 0);
  });

  it('never sells a locked holding', () => {
    const input = { ...twoAccounts(), locked: [true, false] };
    const r = rebalancePath(input);
    const plan = rebalancePlan(input, r, r.smart.length - 1);
    expect(plan.sales).toEqual([]);
    expect(plan.trades[0]).toBe(0);
    expect(r.smart[r.smart.length - 1].te).toBeCloseTo(r.te0, 10);
  });
});
