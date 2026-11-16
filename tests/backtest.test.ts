import { describe, expect, it } from 'vitest';
import { runBacktest, standardStrategies, type Strategy } from '@/lib/math/backtest';
import { mulberry32 } from '@/lib/math/optimizer';

const rand = mulberry32(3);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const T = 400;
const dates = Array.from({ length: T }, (_, i) => `d${String(i).padStart(4, '0')}`);
const returns = Array.from({ length: T }, () => [0.0004 + 0.01 * gauss(), 0.0002 + 0.006 * gauss(), 0.0003 + 0.008 * gauss()]);
const bench = returns.map((r) => r[0]);
const opts = { trainDays: 100, rebalanceDays: 20, costRate: 0 };

describe('walk-forward backtest', () => {
  it('never shows a strategy data from on or after the rebalance day', () => {
    const seen: Array<{ t: number; rows: number; lastRow: number[] }> = [];
    const spy: Strategy = {
      id: 'spy',
      name: 'spy',
      description: '',
      target: (ctx) => {
        seen.push({ t: ctx.t, rows: ctx.window.length, lastRow: ctx.window[ctx.window.length - 1] });
        return [1, 0, 0];
      },
    };
    runBacktest(dates, returns, bench, [spy], opts);
    expect(seen.length).toBe(15); // rebalances at t = 100, 120, ..., 380
    for (const s of seen) {
      expect(s.rows).toBe(100);
      expect(s.lastRow).toEqual(returns[s.t - 1]); // the window ends the day before
    }
  });

  it('reproduces buy-and-hold when a strategy holds one asset', () => {
    const only: Strategy = { id: 'a', name: 'a', description: '', target: () => [1, 0, 0] };
    const r = runBacktest(dates, returns, bench, [only], opts);
    const nifty = r.strategies.find((s) => s.id === 'nifty')!;
    expect(r.strategies[0].finalValue).toBeCloseTo(nifty.finalValue, 10);
  });

  it('charges trading costs on rebalances after the first purchase', () => {
    const flip: Strategy = { id: 'f', name: 'f', description: '', target: ({ t }) => ((t / 20) % 2 === 0 ? [1, 0, 0] : [0, 1, 0]) };
    const free = runBacktest(dates, returns, bench, [flip], opts).strategies[0];
    const costly = runBacktest(dates, returns, bench, [flip], { ...opts, costRate: 0.002 }).strategies[0];
    expect(costly.finalValue).toBeLessThan(free.finalValue);
    expect(costly.costsPaid).toBeGreaterThan(0);
    expect(free.annualTurnover).toBeGreaterThan(5); // the whole portfolio flips every month
  });

  it('runs the standard strategies with valid long-only weights', () => {
    const strategies = standardStrategies([0.5, 0.3, 0.2], [0.12, 0.08, 0.1], 0.06, 0.6);
    const r = runBacktest(dates, returns, bench, strategies, opts);
    expect(r.strategies.map((s) => s.id)).toEqual(['current', 'equal', 'minvar', 'maxsharpe', 'nifty']);
    for (const s of strategies) {
      const w = s.target({ window: returns.slice(0, 100), t: 100 });
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.max(...w)).toBeLessThanOrEqual(0.6 + 1e-9);
    }
    // Minimum variance should be the least volatile constructed portfolio.
    const vol = (id: string) => r.strategies.find((s) => s.id === id)!.volatility;
    expect(vol('minvar')).toBeLessThan(vol('equal'));
  });
});
