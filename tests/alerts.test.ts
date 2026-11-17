import { describe, expect, it } from 'vitest';
import { buildAlerts, financialYearEnd, peakAndLast, unrecordedSplitFactor, type AlertInput } from '@/lib/math/alerts';
import { classifyPosition } from '@/lib/math/tax';

const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  asOf: '2026-11-17',
  taxPositions: [],
  tax: { slabRate: 0.2 },
  bookedTax: 0,
  holdings: [],
  unpricedCount: 0,
  latestPriceDate: '2026-11-16',
  goals: [],
  emergencyFundMonths: null,
  emergencyTargetMonths: 6,
  ...over,
});

const pos = (id: string, purchaseDate: string, cost: number, price: number, units = 100, asOf = '2026-11-17') =>
  classifyPosition({ id, symbol: id, name: id, category: 'equity', purchaseDate, units, costPerUnit: cost, price }, asOf);

describe('smart alerts', () => {
  it('finds the end of the financial year', () => {
    expect(financialYearEnd('2026-11-17')).toBe('2027-03-31');
    expect(financialYearEnd('2027-02-01')).toBe('2027-03-31');
    expect(financialYearEnd('2027-04-01')).toBe('2028-03-31');
  });

  it('warns before selling a lot that turns long-term soon', () => {
    const alerts = buildAlerts(base({ taxPositions: [pos('INFY', '2025-12-01', 1000, 1200)] }));
    const wait = alerts.find((a) => a.id.startsWith('wait:'));
    expect(wait).toBeDefined();
    expect(wait!.dueDate).toBe('2026-12-02');
    expect(wait!.amountINR).toBe(Math.round(20_000 * 0.2 * 1.04));
  });

  it('raises the unused exemption to "act now" in the last 90 days of the year', () => {
    const positions = [pos('NIFTY', '2022-01-01', 100, 400, 100, '2027-02-01')];
    const early = buildAlerts(base({ taxPositions: [pos('NIFTY', '2022-01-01', 100, 400)] })).find((a) => a.id.startsWith('harvest:'));
    const late = buildAlerts(base({ asOf: '2027-02-01', taxPositions: positions })).find((a) => a.id.startsWith('harvest:'));
    expect(early?.severity).toBe('info');
    expect(late?.severity).toBe('act');
    expect(late?.title).toMatch(/^58 days left/);
  });

  it('flags concentration, a deep fall from the high, low goal odds, a thin safety net and stale prices', () => {
    const alerts = buildAlerts(
      base({
        holdings: [
          { symbol: 'BIG', name: 'Big', value: 40_000, weight: 0.4, last: 70, peak1y: 100, peakDate: '2026-01-10' },
          { symbol: 'OK', name: 'Ok', value: 60_000, weight: 0.24, last: 95, peak1y: 100 },
        ],
        goals: [
          { name: 'Home', probability: 0.42, deadline: '2031-12-31' },
          { name: 'Car', probability: 0.6, deadline: '2028-12-31' },
          { name: 'Trip', probability: 0.9, deadline: '2027-06-30' },
        ],
        emergencyFundMonths: 2.5,
        latestPriceDate: '2026-11-10',
      })
    );
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('conc:BIG');
    expect(ids).not.toContain('conc:OK');
    expect(ids).toContain('dd:BIG:2026-01-10');
    expect(ids.some((i) => i.startsWith('dd:OK'))).toBe(false);
    expect(alerts.find((a) => a.id.startsWith('goal:Home'))?.severity).toBe('act');
    expect(alerts.find((a) => a.id.startsWith('goal:Car'))?.severity).toBe('watch');
    expect(ids.some((i) => i.startsWith('goal:Trip'))).toBe(false);
    expect(alerts.find((a) => a.id.startsWith('emergency'))?.severity).toBe('act');
    expect(ids).toContain('stale:2026-11-10');
    // "Act now" first, then "keep an eye on", then "good to know".
    const order = alerts.map((a) => a.severity);
    expect(order).toEqual([...order].sort((a, b) => ['act', 'watch', 'info'].indexOf(a) - ['act', 'watch', 'info'].indexOf(b)));
  });

  it('suggests loss harvesting only when there is tax to cancel', () => {
    const loser = pos('LOSS', '2026-03-01', 200, 150);
    expect(buildAlerts(base({ taxPositions: [loser] })).some((a) => a.id.startsWith('loss:'))).toBe(false);
    const withTax = buildAlerts(base({ taxPositions: [loser], bookedTax: 3000 })).find((a) => a.id.startsWith('loss:'));
    expect(withTax?.amountINR).toBe(Math.round(5000 * 0.2 * 1.04)); // capped by the loss, not the ₹3,000 due
  });

  it('takes the peak and the last close from a series', () => {
    expect(peakAndLast([{ date: 'a', close: 1 }, { date: 'b', close: 3 }, { date: 'c', close: 2 }])).toEqual({ last: 2, peak: 3, peakDate: 'b' });
    expect(peakAndLast([])).toEqual({ last: null, peak: null, peakDate: null });
  });

  it('spots a bonus or split that was never recorded from cost versus the adjusted price', () => {
    expect(unrecordedSplitFactor(1540, 769.8)).toBe(2);
    expect(unrecordedSplitFactor(1620, 1590.85)).toBeNull();
    expect(unrecordedSplitFactor(88.2, 75.638)).toBeNull(); // 1.17x: an ordinary price difference
    expect(unrecordedSplitFactor(500, 100)).toBe(5);
    const [a] = buildAlerts(base({ costChecks: [{ symbol: 'HDFCBANK', units: 60, averageCost: 1540, purchaseDate: '2023-10-11', adjustedClose: 769.8, price: 816.5 }] }));
    expect(a.severity).toBe('act');
    expect(a.href).toBe('/portfolio/ledger?symbol=HDFCBANK&type=BONUS&quantity=60');
    expect(a.body).toContain('you hold 120 shares, not 60');
    expect(a.body).toContain('loss of ₹43,410 shown is really a gain of ₹5,580');
  });
});
