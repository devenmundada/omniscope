import 'server-only';
import type { UserHoldingView } from './portfolio';
import type { GoalProjectionDetails } from '@/lib/math/financial-projections';
import { simulateGoal, blendPortfolioStats, type MonteCarloResult } from '@/lib/math/monte-carlo';
import type { AssetClassStats } from './performance';
import { defaultStatsFor } from './performance';
import { portfolioRiskModel } from './risk';

export interface GoalSimulation {
  nominal: MonteCarloResult;
  inflationAdjustedProbability: number;
  assumptionSource: 'risk-model' | 'portfolio-history' | 'portfolio-defaults' | 'balanced-default';
  annualReturn: number;
  annualVolatility: number;
}

/** Derives portfolio-level return/volatility from verified holdings and asset-class history. */
export function portfolioAssumptions(holdings: UserHoldingView[], stats: AssetClassStats[]) {
  const priced = holdings.filter((h) => h.currentValue != null);
  if (priced.length === 0) {
    return { annualReturn: 0.1, annualVolatility: 0.15, source: 'balanced-default' as const };
  }
  const byClass = new Map<string, number>();
  for (const h of priced) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + (h.currentValue as number));
  const weights = [...byClass.entries()].map(([ac, v]) => {
    const st = stats.find((s) => s.assetClass === ac);
    const def = defaultStatsFor(ac);
    return { weight: v, annualReturn: st?.annualReturn ?? def.r, annualVolatility: st?.annualVolatility ?? def.v };
  });
  const blended = blendPortfolioStats(weights);
  const fromHistory = stats.some((s) => s.observations >= 120);
  return { ...blended, source: fromHistory ? ('portfolio-history' as const) : ('portfolio-defaults' as const) };
}

/**
 * The return and volatility every module uses to simulate goals: the Risk Lab model of the actual
 * holdings (shrunk expected returns, Ledoit-Wolf covariance) when there is enough price history,
 * otherwise asset-class estimates. Goals, the Copilot, alerts and the report all call this, so they
 * always show the same probability for the same goal.
 */
export async function goalAssumptions(userId: string, holdings: UserHoldingView[], stats: AssetClassStats[]) {
  const riskModel = holdings.length > 0 ? await portfolioRiskModel(userId, holdings).catch(() => null) : null;
  return riskModel ? { ...riskModel, source: 'risk-model' as const } : portfolioAssumptions(holdings, stats);
}

export function simulateGoalFromDetails(
  details: GoalProjectionDetails,
  assumptions: { annualReturn: number; annualVolatility: number; source: GoalSimulation['assumptionSource'] },
  seedSalt: number
): GoalSimulation | null {
  if (details.isFunded || details.isOverdue || details.monthsRemaining <= 0) return null;
  const base = {
    currentCorpus: details.currentAllocatedAmount,
    monthlyContribution: details.monthlyContribution,
    months: details.monthsRemaining,
    annualReturn: assumptions.annualReturn,
    annualVolatility: assumptions.annualVolatility,
    paths: 10000,
    seed: 20261115 + seedSalt,
  };
  const nominal = simulateGoal({ ...base, target: details.targetAmount });
  const real = simulateGoal({ ...base, target: details.inflationAdjustedTarget, paths: 4000 });
  return {
    nominal,
    inflationAdjustedProbability: real.probabilityOfSuccess,
    assumptionSource: assumptions.source,
    annualReturn: assumptions.annualReturn,
    annualVolatility: assumptions.annualVolatility,
  };
}
