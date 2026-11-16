import { describe, expect, it } from 'vitest';
import { xirr } from '@/lib/math/xirr';

const d = (s: string) => new Date(s);

describe('xirr', () => {
  it('returns 10% for a one-year 10% gain', () => {
    const r = xirr([
      { amount: -100000, date: d('2025-01-01') },
      { amount: 110000, date: d('2026-01-01') },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });

  it('matches the spreadsheet XIRR for irregular flows', () => {
    // Excel XIRR for these flows = 37.34%
    const r = xirr([
      { amount: -10000, date: d('2008-01-01') },
      { amount: 2750, date: d('2008-03-01') },
      { amount: 4250, date: d('2008-10-30') },
      { amount: 3250, date: d('2009-02-15') },
      { amount: 2750, date: d('2009-04-01') },
    ]);
    expect(r!).toBeCloseTo(0.3734, 3);
  });

  it('handles losses', () => {
    const r = xirr([
      { amount: -50000, date: d('2024-06-01') },
      { amount: 40000, date: d('2026-06-01') },
    ]);
    expect(r!).toBeLessThan(0);
    expect(r!).toBeCloseTo(Math.sqrt(0.8) - 1, 2);
  });

  it('returns null without both signs', () => {
    expect(xirr([{ amount: -1000, date: d('2025-01-01') }, { amount: -500, date: d('2025-06-01') }])).toBeNull();
    expect(xirr([{ amount: 1000, date: d('2025-01-01') }])).toBeNull();
  });
});
