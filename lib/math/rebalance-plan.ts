/** Shared (server and client) helpers that turn optimiser presets into rebalancer inputs. */
import { efficientFrontier, evaluate, frontierAtVolatility } from './optimizer';
import { naiveCostAt, rebalancePath, rebalancePlan, type BookedGain, type RebalanceAsset, type RebalanceInput } from './rebalance';
import type { Matrix } from './risk';

export interface RebalanceData {
  asOf: string;
  financialYear: string;
  assets: Array<RebalanceAsset & { assetClass: string; weight: number }>;
  optimizer: { mu: number[]; cov: Matrix; riskFree: number };
  slabRate: number;
  slabSource: 'profile' | 'assumed';
  booked: BookedGain[];
  bookedLtcgEquity: number;
  /** Holdings left out of the risk model (and so of the rebalance). */
  excluded: Array<{ symbol: string; name: string; value: number; reason: string }>;
}

export type RebalanceTarget = 'maxSharpe' | 'minVariance' | 'sameRisk';

export const TARGET_LABELS: Record<RebalanceTarget, string> = {
  maxSharpe: 'Best risk-adjusted mix',
  minVariance: 'Lowest-risk mix',
  sameRisk: 'Same risk, more return',
};

/** Target weights for a named optimiser preset, with at most `cap` in any one holding. */
export function targetWeights(data: RebalanceData, target: RebalanceTarget, cap = 0.35): number[] {
  const { mu, cov, riskFree } = data.optimizer;
  const c = Math.max(cap, 1 / data.assets.length + 1e-6);
  if (target === 'sameRisk') {
    const current = evaluate(data.assets.map((a) => a.weight), mu, cov, riskFree);
    return frontierAtVolatility(mu, cov, riskFree, c, current.volatility).weights;
  }
  const f = efficientFrontier(mu, cov, riskFree, c);
  return (target === 'minVariance' ? f.minVariance : f.maxSharpe).weights;
}

export function rebalanceInput(data: RebalanceData, weights: number[], cash: number, locked?: boolean[]): RebalanceInput {
  return {
    locked,
    assets: data.assets,
    target: weights,
    cov: data.optimizer.cov,
    cash,
    asOf: data.asOf,
    tax: { slabRate: data.slabRate },
    booked: data.booked,
  };
}

/** A compact summary of the tax-smart plan (used by the Copilot). */
export function summarisePlan(data: RebalanceData, target: RebalanceTarget, cash: number, locked?: boolean[]) {
  const weights = targetWeights(data, target);
  const input = rebalanceInput(data, weights, cash, locked);
  const result = rebalancePath(input);
  const plan = rebalancePlan(input, result, result.recommendedStep);
  const full = rebalancePlan(input, result, result.moves.length);
  const naiveFull = result.naive[result.naive.length - 1];
  const naiveSame = naiveCostAt(result, plan.te);
  return { weights, input, result, plan, full, naiveFull, naiveSame };
}

/** Gold bonds (tax-free at maturity) and deposits (break penalties) are kept out of sales by default. */
export const defaultLocks = (data: RebalanceData) => data.assets.map((a) => a.category === 'sgb' || a.category === 'deposit');
