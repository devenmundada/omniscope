import { describe, expect, it } from 'vitest';
import { runStudy, syntheticCase } from '@/lib/eval/rebalance-study';

describe('rebalancing study', () => {
  it('is reproducible from its seeds', () => {
    expect(syntheticCase(7)).toEqual(syntheticCase(7));
    expect(runStudy(20).summary).toEqual(runStudy(20).summary);
  });

  it('shows the tax-smart path paying less tax than oldest-first selling at equal alignment', () => {
    const { summary } = runStudy(200);
    expect(summary.trials).toBe(200);
    expect(summary.totalTaxSmart90).toBeLessThan(summary.totalTaxNaive90 * 0.6);
    expect(summary.smartNoWorse90).toBeGreaterThan(0.85);
    expect(summary.totalTaxSmartFull).toBeLessThanOrEqual(summary.totalTaxNaiveFull);
  });
});
