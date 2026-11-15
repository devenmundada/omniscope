import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { computeGoalProjectionDetails } from '@/lib/math/financial-projections';
import { simulateGoal } from '@/lib/math/monte-carlo';
import {
  goalsDigest,
  healthDigest,
  holdingsList,
  portfolioOverview,
  xrayDigest,
  type FinancialSnapshot,
} from './snapshot';

/**
 * Tools the AI Wealth Copilot can call. Every tool reads from the signed-in user's own verified
 * snapshot (already scoped by user id), so the model never sees another user's data and never
 * invents numbers: figures in answers come from these tool results.
 */
export function buildCopilotTools(snapshot: FinancialSnapshot) {
  return {
    getPortfolioOverview: tool({
      description:
        'Totals for the user: invested amount, verified market value, unrealised gain, XIRR, 1-year return vs Nifty 50, allocation by asset class, and pricing coverage.',
      inputSchema: z.object({}),
      execute: async () => portfolioOverview(snapshot),
    }),
    getHoldings: tool({
      description: 'Lists the user’s holdings with units, cost, latest verified price and source, market value, gain and weight. Optionally filter by asset class.',
      inputSchema: z.object({
        assetClass: z.string().optional().describe('e.g. "Indian Stocks", "Mutual Funds", "ETFs", "Gold", "Fixed Income"'),
      }),
      execute: async ({ assetClass }) => holdingsList(snapshot, assetClass),
    }),
    getPortfolioXRay: tool({
      description: 'Concentration and exposure analysis: HHI, largest/top-3/top-5 weights, sector and market-cap split, and rule-based insights.',
      inputSchema: z.object({}),
      execute: async () => xrayDigest(snapshot),
    }),
    getFinancialHealth: tool({
      description: 'The five-pillar Financial Health score (emergency fund, savings rate, diversification, protection, goals) with each pillar’s metric, insight, recommendation and active risk diagnostics.',
      inputSchema: z.object({}),
      execute: async () => healthDigest(snapshot),
    }),
    getGoals: tool({
      description: 'All goals with targets, deadlines, SIP, required SIP, deterministic projection and Monte Carlo probability of success.',
      inputSchema: z.object({}),
      execute: async () => goalsDigest(snapshot),
    }),
    simulateGoalChange: tool({
      description:
        'What-if analysis for an existing goal: recompute the projection and Monte Carlo probability if the monthly SIP, target amount, deadline year or starting corpus changes. Use this whenever the user asks "what if" or "how much should I invest".',
      inputSchema: z.object({
        goalName: z.string().describe('Name (or part of the name) of an existing goal'),
        newMonthlySip: z.number().positive().optional(),
        newTargetAmount: z.number().positive().optional(),
        newTargetYear: z.number().int().min(2025).max(2100).optional(),
        additionalLumpSum: z.number().nonnegative().optional(),
      }),
      execute: async ({ goalName, newMonthlySip, newTargetAmount, newTargetYear, additionalLumpSum }) => {
        const match = snapshot.summary.goalsSummary.projections.find((p) =>
          p.goal.name.toLowerCase().includes(goalName.toLowerCase())
        );
        if (!match) {
          return { error: `No goal matching "${goalName}". Existing goals: ${snapshot.summary.goalsSummary.projections.map((p) => p.goal.name).join(', ') || 'none'}` };
        }
        const g = match.goal;
        const input = {
          name: g.name,
          targetAmount: newTargetAmount != null ? String(newTargetAmount) : g.targetAmount,
          currentAllocatedAmount: String(Number(g.currentAllocatedAmount) + (additionalLumpSum ?? 0)),
          monthlyContribution: newMonthlySip != null ? String(newMonthlySip) : g.monthlyContribution,
          targetYear: newTargetYear ?? g.targetYear,
          targetDate: newTargetYear != null ? null : g.targetDate,
          metadata: g.metadata as { assumedCagrPct?: number; assumedInflationPct?: number } | null,
        };
        const d = computeGoalProjectionDetails(input, new Date());
        const sim = d.monthsRemaining > 0
          ? simulateGoal({
              currentCorpus: d.currentAllocatedAmount,
              monthlyContribution: d.monthlyContribution,
              months: d.monthsRemaining,
              target: d.targetAmount,
              annualReturn: snapshot.assumptions.annualReturn,
              annualVolatility: snapshot.assumptions.annualVolatility,
              paths: 10000,
            })
          : null;
        const before = snapshot.goalSimulations.find((s) => s.goalId === g.id)?.simulation;
        return {
          goal: g.name,
          scenario: { monthlySipINR: d.monthlyContribution, targetINR: d.targetAmount, deadline: d.deadlineDate, startingCorpusINR: d.currentAllocatedAmount },
          baselineProjectionINR: Math.round(d.scenarios.baseline.projectedFutureValue),
          requiredSipAt10PctINR: Math.round(d.requiredMonthlySavings),
          feasibility: d.scenarioFeasibility,
          monteCarloProbabilityPct: sim ? Math.round(sim.probabilityOfSuccess * 100) : null,
          previousMonteCarloProbabilityPct: before ? Math.round(before.nominal.probabilityOfSuccess * 100) : null,
          medianOutcomeINR: sim ? Math.round(sim.p50) : null,
          badMarketOutcomeINR: sim ? Math.round(sim.p10) : null,
        };
      },
    }),
    calculateSip: tool({
      description: 'Generic SIP calculator: future value of a lump sum plus monthly SIP at an annual return for a number of years (monthly compounding).',
      inputSchema: z.object({
        monthlySip: z.number().nonnegative(),
        years: z.number().positive().max(60),
        annualReturnPct: z.number().min(0).max(30),
        lumpSum: z.number().nonnegative().optional(),
      }),
      execute: async ({ monthlySip, years, annualReturnPct, lumpSum }) => {
        const n = Math.round(years * 12);
        const i = annualReturnPct / 100 / 12;
        const g = Math.pow(1 + i, n);
        const fv = (lumpSum ?? 0) * g + (i === 0 ? monthlySip * n : monthlySip * ((g - 1) / i));
        const invested = (lumpSum ?? 0) + monthlySip * n;
        return { futureValueINR: Math.round(fv), totalInvestedINR: Math.round(invested), wealthGainedINR: Math.round(fv - invested) };
      },
    }),
  };
}

export const COPILOT_TOOL_LABELS: Record<string, string> = {
  getPortfolioOverview: 'Read your portfolio totals',
  getHoldings: 'Read your holdings',
  getPortfolioXRay: 'Ran your Portfolio X-Ray',
  getFinancialHealth: 'Checked your Financial Health',
  getGoals: 'Read your goals',
  simulateGoalChange: 'Simulated a what-if scenario',
  calculateSip: 'Ran a SIP calculation',
};
