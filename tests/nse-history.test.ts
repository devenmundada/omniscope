import { describe, expect, it } from 'vitest';
import { buildAdjustedCloses, corporateActionFactor, recentWeekdays, bhavcopyUrl, type BhavDay } from '@/lib/market-data/nse-history';

const day = (date: string, rows: Record<string, number>): BhavDay => ({
  date,
  rows: new Map(Object.entries(rows).map(([s, close]) => [s, { close }])),
});

describe('NSE history', () => {
  it('spots bonus and split ratios but leaves real moves alone', () => {
    expect(corporateActionFactor(973.4 / 1964.1)).toBeCloseTo(1 / 2); // HDFC Bank 1:1 bonus, 26 Aug 2025
    expect(corporateActionFactor(0.102)).toBeCloseTo(1 / 10); // Bajaj Finance split + bonus
    expect(corporateActionFactor(0.198)).toBeCloseTo(1 / 5); // 5:1 split
    expect(corporateActionFactor(1.08)).toBe(1); // ordinary 8% day
    expect(corporateActionFactor(0.82)).toBe(1); // 18% fall is below the threshold
  });

  it('adjusts history backwards across a bonus and keeps today\'s close', () => {
    const series = buildAdjustedCloses(
      [day('2025-08-25', { HDFCBANK: 1964.1 }), day('2025-08-26', { HDFCBANK: 973.4 }), day('2025-08-28', { HDFCBANK: 957.8 })],
      ['HDFCBANK', 'MISSING']
    ).get('HDFCBANK')!;
    expect(series.map((p) => p.date)).toEqual(['2025-08-25', '2025-08-26', '2025-08-28']);
    expect(series[2].close).toBe(957.8);
    expect(series[1].close).toBe(973.4);
    expect(series[0].close).toBeCloseTo(982.05, 2); // 1964.10 / 2
  });

  it('keeps the move across a day with no file', () => {
    const s = buildAdjustedCloses([day('2026-03-04', { X: 110 }), day('2026-03-02', { X: 100 })], ['X']).get('X')!;
    expect(s).toEqual([{ date: '2026-03-02', close: 100 }, { date: '2026-03-04', close: 110 }]);
  });

  it('lists weekdays in IST and builds archive URLs', () => {
    const days = recentWeekdays(7, new Date('2026-11-16T12:00:00Z')); // Monday
    expect(days[0]).toBe('2026-11-16');
    expect(days).not.toContain('2026-11-15'); // Sunday
    expect(days).toHaveLength(6);
    expect(bhavcopyUrl('2025-08-26')).toBe('https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_26082025.csv');
  });
});
