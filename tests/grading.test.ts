import { describe, expect, it } from 'vitest';
import { checkPasses, extractNumbers, factPresent, latencyStats, nameSimilarity, scoreStatement } from '@/lib/eval/grading';

describe('number extraction', () => {
  it('reads Indian money formats, percentages and plain numbers', () => {
    const n = extractNumbers('Worth ₹7.43 lakh (₹7,43,412), up 25.4%, Sharpe 0.29, VaR Rs 36,011, goal ₹1.2 crore, loss of −₹1.46 L, 36k');
    const values = n.map((x) => Math.round(x.value * 100) / 100);
    expect(values).toEqual(expect.arrayContaining([743000, 743412, 25.4, 0.29, 36011, 12000000, 146000, 36000]));
    expect(n.find((x) => x.value === 25.4)?.percent).toBe(true);
    expect(n.find((x) => x.value === 36011)?.money).toBe(true);
  });
});

describe('fact checking', () => {
  it('accepts normal rounding and rejects wrong figures', () => {
    expect(factPresent('Your portfolio is worth ₹7.43 lakh.', { label: 'v', value: 743412, unit: 'inr' })).toBe(true);
    expect(factPresent('Your portfolio is worth ₹6.9 lakh.', { label: 'v', value: 743412, unit: 'inr' })).toBe(false);
    expect(factPresent('Volatility is 13.5% a year.', { label: 'vol', value: 13.47, unit: 'pct' })).toBe(true);
    expect(factPresent('Volatility is 13.5 (not a percentage).', { label: 'vol', value: 13.47, unit: 'pct' })).toBe(false);
    expect(factPresent('Your Sharpe ratio is 0.29.', { label: 's', value: 0.29, unit: 'number' })).toBe(true);
    expect(factPresent('A 2008-style crash could cost about ₹2.26 lakh.', { label: 'pnl', value: -225_800, unit: 'inr' })).toBe(true);
    // Small plain numbers are not mistaken for rupee amounts.
    expect(factPresent('You hold 10 holdings across 2 accounts.', { label: 'x', value: 10, unit: 'inr' })).toBe(false);
  });

  it('applies text checks', () => {
    const disclaimer = { label: 'd', must: /not a SEBI-registered/i, mustNot: /you should buy/i };
    expect(checkPasses('I am not a SEBI-registered adviser, but here is the analysis.', disclaimer)).toBe(true);
    expect(checkPasses('I am not a SEBI-registered adviser, but you should buy it.', disclaimer)).toBe(false);
  });

  it('computes latency percentiles', () => {
    expect(latencyStats([5, 1, 3, 2, 4])).toEqual({ median: 3, p95: 5 });
    expect(latencyStats([1, 2, 3, 4]).median).toBe(2.5);
  });
});

describe('statement scoring', () => {
  it('pairs by ISIN or name and scores each printed field', () => {
    expect(nameSimilarity('Infosys Ltd', 'INFOSYS LIMITED')).toBe(1);
    const s = scoreStatement(
      [
        { name: 'Infosys Ltd', isin: 'INE009A01021', quantity: 50, averageCost: 1620, totalCost: null },
        { name: 'Parag Parikh Flexi Cap Fund', isin: null, quantity: 820.44, averageCost: null, totalCost: 51195 },
        { name: 'TCS', isin: 'INE467B01029', quantity: 15, averageCost: 3650, totalCost: null },
      ],
      [
        { securityName: 'INFOSYS LIMITED', isin: 'INE009A01021', quantity: 50, averageCost: 1620, totalCost: null },
        { securityName: 'Parag Parikh Flexi Cap Fund - Direct Growth', isin: null, quantity: 820.44, averageCost: null, totalCost: 50000 },
        { securityName: 'Random Bond', isin: null, quantity: 1, averageCost: null, totalCost: null },
      ]
    );
    expect(s.matched).toBe(2);
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.fields.quantity).toEqual({ correct: 2, total: 2 });
    expect(s.fields.totalCost).toEqual({ correct: 0, total: 1 }); // 50,000 is 2.3% off the printed 51,195
    expect(s.errors).toEqual(expect.arrayContaining(['Missed TCS', 'Extra holding "Random Bond"']));
  });
});
