import 'server-only';
import { loadPortfolioReturns, returnPriors } from './risk';
import { runBacktest, standardStrategies, type BacktestResult } from '@/lib/math/backtest';
import { RISK_FREE_RATE } from '@/lib/math/risk';

export interface BacktestReport extends BacktestResult {
  holdings: string[];
  excluded: string[];
}

/** Five-year walk-forward backtest of the optimiser against simple baselines, on the user's own holdings. */
export async function getBacktestReport(userId: string): Promise<BacktestReport | null> {
  const data = await loadPortfolioReturns(userId, 1900);
  if (!data || data.dates.length < 252 + 126) return null;
  const total = data.included.reduce((s, a) => s + a.value, 0);
  const weights = data.included.map((a) => a.value / total);
  const { priors } = returnPriors(data);
  const result = runBacktest(data.dates, data.returns, data.nifty, standardStrategies(weights, priors, RISK_FREE_RATE, 0.35), {
    trainDays: 252,
    rebalanceDays: 21,
    costRate: 0.001,
    riskFree: RISK_FREE_RATE,
  });
  return {
    ...result,
    // Weekly points keep the page light; metrics above use every day.
    strategies: result.strategies.map((s) => ({ ...s, curve: s.curve.filter((_, i) => i % 5 === 0 || i === s.curve.length - 1) })),
    holdings: data.included.map((a) => a.symbol),
    excluded: data.excluded.map((e) => e.symbol),
  };
}
