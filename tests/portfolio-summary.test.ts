import { describe, expect, it } from 'vitest';
import { calculatePortfolioSummary, type UserHoldingView } from '@/lib/db/portfolio';

const holding = (o: Partial<UserHoldingView>) =>
  ({ accountId: 'a1', assetClass: 'Indian Stocks', investedAmount: 0, currentValue: null, priceTimestamp: null, ...o }) as UserHoldingView;

describe('calculatePortfolioSummary', () => {
  it('measures gain only against the cost of priced holdings', () => {
    const s = calculatePortfolioSummary([
      holding({ investedAmount: 100_000, currentValue: 110_000 }),
      holding({ investedAmount: 50_000, currentValue: 45_000 }),
      holding({ investedAmount: 300_000, currentValue: null }), // awaiting a price
    ]);
    expect(s.totalInvested).toBe(450_000);
    expect(s.pricedInvested).toBe(150_000);
    expect(s.totalCurrentValue).toBe(155_000);
    expect(s.totalUnrealizedGain).toBe(5_000);
    expect(s.totalUnrealizedGainPct).toBeCloseTo(3.333, 2);
    expect(s.unpricedHoldingCount).toBe(1);
    expect(s.isFullyPriced).toBe(false);
  });

  it('reports no gain until something is priced', () => {
    const s = calculatePortfolioSummary([holding({ investedAmount: 10_000 })]);
    expect(s.pricedInvested).toBe(0);
    expect(s.totalCurrentValue).toBeNull();
    expect(s.totalUnrealizedGain).toBeNull();
  });

  it('matches the plain calculation when everything is priced', () => {
    const s = calculatePortfolioSummary([
      holding({ investedAmount: 20_000, currentValue: 18_000 }),
      holding({ investedAmount: 30_000, currentValue: 36_000 }),
    ]);
    expect(s.pricedInvested).toBe(s.totalInvested);
    expect(s.totalUnrealizedGain).toBe(4_000);
    expect(s.totalUnrealizedGainPct).toBeCloseTo(8, 5);
    expect(s.isFullyPriced).toBe(true);
  });
});
