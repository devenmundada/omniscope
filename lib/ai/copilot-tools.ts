import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { computeGoalProjectionDetails } from '@/lib/math/financial-projections';
import { simulateGoal } from '@/lib/math/monte-carlo';
import { getRiskReport, type RiskReport } from '@/lib/db/risk';
import { efficientFrontier, evaluate, HISTORICAL_SCENARIOS, rebalanceTrades, stressTest } from '@/lib/math/optimizer';
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
const pct1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);

export function buildCopilotTools(snapshot: FinancialSnapshot) {
  // The risk report needs two years of prices, so load it once, only if a risk tool is called.
  let riskPromise: Promise<RiskReport | null> | null = null;
  const risk = () => (riskPromise ??= getRiskReport(snapshot.summary.userId).catch(() => null));
  const noRisk = { error: 'Not enough verified price history to analyse risk yet. Add holdings and sync prices on the Portfolio page.' };

  return {
    getRiskReport: tool({
      description:
        'Risk analysis from two years of verified daily prices: annual return (CAGR), volatility, Sharpe, Sortino, worst drawdown with dates, beta and alpha vs Nifty 50, 1-day and 1-month 95% Value-at-Risk and CVaR in rupees, diversification benefit, and each holding\u2019s share of money vs share of risk. Use for any question about risk, volatility, drawdowns, VaR or "how risky is my portfolio".',
      inputSchema: z.object({}),
      execute: async () => {
        const r = await risk();
        if (!r) return noRisk;
        const m = r.metrics;
        const standalone = r.assets.reduce((s, a) => s + a.weight * a.annualVolatility, 0);
        return {
          window: `${m.fromDate} to ${m.toDate} (${m.observations} trading days)`,
          analysedValueINR: Math.round(r.analysedValue),
          annualReturnPct: pct1(m.annualReturn),
          volatilityPct: pct1(m.annualVolatility),
          sharpe: Math.round(m.sharpe * 100) / 100,
          sortino: Math.round(m.sortino * 100) / 100,
          maxDrawdownPct: pct1(m.maxDrawdown),
          maxDrawdownPeriod: `${m.maxDrawdownFrom} to ${m.maxDrawdownTo}`,
          betaToNifty: m.beta == null ? null : Math.round(m.beta * 100) / 100,
          alphaPct: pct1(m.alpha),
          var95OneDayINR: Math.round(m.var95Daily * r.analysedValue),
          var95OneMonthINR: Math.round(m.var95Monthly * r.analysedValue),
          cvar95OneMonthINR: Math.round(m.cvar95Monthly * r.analysedValue),
          diversificationBenefitPct: standalone > 0 ? pct1(1 - m.annualVolatility / standalone) : null,
          nifty50: { annualReturnPct: pct1(r.benchmark.annualReturn), volatilityPct: pct1(r.benchmark.annualVolatility), maxDrawdownPct: pct1(r.benchmark.maxDrawdown) },
          riskFreeRatePct: pct1(r.riskFree),
          holdings: r.assets.map((a) => ({
            symbol: a.symbol,
            name: a.name,
            weightPct: pct1(a.weight),
            riskSharePct: pct1(a.riskShare),
            volatilityPct: pct1(a.annualVolatility),
            betaToNifty: Math.round(a.betaEquity * 100) / 100,
            betaToGold: Math.round(a.betaGold * 100) / 100,
            priceProxy: a.proxy,
          })),
          excludedForLackOfHistory: r.excluded.map((e) => e.symbol),
        };
      },
    }),
    optimizePortfolio: tool({
      description:
        'Runs the Markowitz mean-variance optimiser over the user\u2019s own holdings (long-only, Ledoit-Wolf covariance, expected returns shrunk towards long-run asset-class returns). Returns the current vs optimised expected return, volatility and Sharpe, target weights and the rupee trades the model implies. Present results as model output with caveats (tax, exit loads, estimation error), never as a recommendation to buy or sell.',
      inputSchema: z.object({
        objective: z.enum(['max_sharpe', 'min_risk', 'same_risk_more_return']).describe('max_sharpe = best return per unit of risk; min_risk = calmest mix; same_risk_more_return = keep current volatility, maximise return'),
        maxWeightPct: z.number().min(10).max(100).optional().describe('Cap on any single holding, default 35'),
      }),
      execute: async ({ objective, maxWeightPct }) => {
        const r = await risk();
        if (!r) return noRisk;
        const { mu, cov, riskFree } = r.optimizer;
        const current = evaluate(r.assets.map((a) => a.weight), mu, cov, riskFree);
        const f = efficientFrontier(mu, cov, riskFree, (maxWeightPct ?? 35) / 100);
        const target =
          objective === 'min_risk'
            ? f.minVariance
            : objective === 'same_risk_more_return'
              ? [...f.points, f.maxSharpe].filter((p) => p.volatility <= current.volatility + 1e-4).sort((a, b) => b.expectedReturn - a.expectedReturn)[0] ?? f.minVariance
              : f.maxSharpe;
        const trades = rebalanceTrades(r.assets.map((a) => a.value), target.weights);
        return {
          objective,
          maxWeightPct: maxWeightPct ?? 35,
          current: { expectedReturnPct: pct1(current.expectedReturn), volatilityPct: pct1(current.volatility), sharpe: Math.round(current.sharpe * 100) / 100 },
          optimised: { expectedReturnPct: pct1(target.expectedReturn), volatilityPct: pct1(target.volatility), sharpe: Math.round(target.sharpe * 100) / 100 },
          weights: r.assets
            .map((a, i) => ({ symbol: a.symbol, currentPct: pct1(a.weight), targetPct: pct1(target.weights[i]) }))
            .sort((a, b) => (b.targetPct ?? 0) - (a.targetPct ?? 0)),
          impliedTradesINR: trades.map((t) => ({ symbol: r.assets[t.index].symbol, amountINR: t.amount })),
          caveats: 'Model output from two years of data, not advice. Ignores capital-gains tax and exit loads; expected returns are uncertain.',
        };
      },
    }),
    stressTestPortfolio: tool({
      description:
        'Crash test: estimates the rupee impact on the user\u2019s holdings of a market scenario, using each holding\u2019s measured sensitivity (two-factor regression) to the Nifty 50 and gold. Scenarios: gfc (2008, Nifty -60%), covid (2020, Nifty -38%), rates (2022, Nifty -17%), gold (gold -20%), or custom moves.',
      inputSchema: z.object({
        scenario: z.enum(['gfc', 'covid', 'rates', 'gold', 'custom']),
        niftyMovePct: z.number().min(-90).max(100).optional().describe('Custom Nifty 50 move in per cent, e.g. -25'),
        goldMovePct: z.number().min(-90).max(100).optional().describe('Custom gold move in per cent, e.g. 10'),
      }),
      execute: async ({ scenario, niftyMovePct, goldMovePct }) => {
        const r = await risk();
        if (!r) return noRisk;
        const preset = HISTORICAL_SCENARIOS.find((s) => s.id === scenario);
        const shock = {
          equity: niftyMovePct != null ? niftyMovePct / 100 : preset?.shock.equity ?? 0,
          gold: goldMovePct != null ? goldMovePct / 100 : preset?.shock.gold ?? 0,
        };
        const expected = evaluate(r.assets.map((a) => a.weight), r.optimizer.mu, r.optimizer.cov, r.riskFree).expectedReturn;
        const res = stressTest(r.assets.map((a) => a.value), r.assets.map((a) => ({ equity: a.betaEquity, gold: a.betaGold })), shock, expected);
        return {
          scenario: preset ? `${preset.name} (${preset.period})` : 'Custom',
          niftyMovePct: pct1(shock.equity),
          goldMovePct: pct1(shock.gold),
          portfolioChangeINR: Math.round(res.pnl),
          portfolioChangePct: pct1(res.portfolioMove),
          sameMoneyInNifty50INR: Math.round(r.analysedValue * shock.equity),
          yearsToRecoverAtExpectedReturn: res.recoveryYears == null ? null : Math.round(res.recoveryYears * 10) / 10,
          byHolding: r.assets
            .map((a, i) => ({ symbol: a.symbol, movePct: pct1(res.moves[i]), changeINR: Math.round(a.value * res.moves[i]) }))
            .sort((a, b) => a.changeINR - b.changeINR),
          method: 'Linear two-factor model (Nifty 50 and gold betas from 2 years of daily returns). Real crashes are often worse because correlations rise.',
        };
      },
    }),
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
  getRiskReport: 'Ran your Risk Lab analysis',
  optimizePortfolio: 'Ran the portfolio optimiser',
  stressTestPortfolio: 'Crash-tested your portfolio',
};
