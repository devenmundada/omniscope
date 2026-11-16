import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { computeGoalProjectionDetails } from '@/lib/math/financial-projections';
import { simulateGoal } from '@/lib/math/monte-carlo';
import { getRiskReport, type RiskReport } from '@/lib/db/risk';
import { getTaxCentreData } from '@/lib/db/tax';
import { goalSeed } from '@/lib/db/goal-optimizer';
import { goalPlan, goalProbability, sipForProbability, type GoalInput } from '@/lib/math/goal-optimizer';
import { CATEGORY_LABELS, classifyPosition, computeTax, lossHarvest, ltcgHarvestPlan, TAX_RULES, waitToSave } from '@/lib/math/tax';
import { efficientFrontier, evaluate, frontierAtVolatility, HISTORICAL_SCENARIOS, rebalanceTrades, stressTest } from '@/lib/math/optimizer';
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
    optimizeForGoals: tool({
      description:
        'Goal-based optimiser: for every portfolio on the user\u2019s efficient frontier, estimates each goal\u2019s Monte Carlo probability of success and finds the mix with the best odds per goal and for all goals together. Returns current vs best probability, the return each goal needs, the best mix\u2019s return and risk, and the SIP needed for an 80% chance. Use for "which mix gives my goals the best chance", "should I take more or less risk for my goal" or similar. Present mixes as model output, not advice.',
      inputSchema: z.object({}),
      execute: async () => {
        const r = await risk();
        if (!r) return noRisk;
        const goals: GoalInput[] = [];
        snapshot.summary.goalsSummary.projections.forEach((p, i) => {
          const d = p.details;
          if (!d.isFunded && !d.isOverdue && d.monthsRemaining > 0)
            goals.push({ id: p.goal.id, name: p.goal.name, corpus: d.currentAllocatedAmount, monthly: d.monthlyContribution, months: d.monthsRemaining, target: d.targetAmount, seed: goalSeed(i) });
        });
        if (goals.length === 0) return { error: 'No open goals to optimise for. Add a goal with a target and deadline on the Goals page.' };
        const { mu, cov, riskFree } = r.optimizer;
        const current = evaluate(r.assets.map((a) => a.weight), mu, cov, riskFree);
        const f = efficientFrontier(mu, cov, riskFree, 0.35, 40);
        const points = [...f.points, f.maxSharpe].sort((a, b) => a.volatility - b.volatility);
        const plan = goalPlan(goals, points, 1500);
        const together = points[plan.average.bestIndex];
        return {
          method: 'Monte Carlo (10,000 paths) at every efficient-frontier portfolio; same seeds as the Goals page.',
          currentMix: { expectedReturnPct: pct1(current.expectedReturn), volatilityPct: pct1(current.volatility) },
          goals: goals.map((g, i) => {
            const best = points[plan.curves[i].bestIndex];
            const sip = sipForProbability(g, best, 0.8, 2000);
            return {
              goal: g.name,
              yearsLeft: Math.round((g.months / 12) * 10) / 10,
              requiredReturnPct: pct1(plan.curves[i].requiredReturn),
              currentProbabilityPct: Math.round(goalProbability(g, current, 10000) * 100),
              bestProbabilityPct: Math.round(goalProbability(g, best, 10000) * 100),
              bestMix: { expectedReturnPct: pct1(best.expectedReturn), volatilityPct: pct1(best.volatility) },
              sipForEightyPctINR: sip,
              currentSipINR: Math.round(g.monthly),
            };
          }),
          bestSingleMixForAllGoals: {
            expectedReturnPct: pct1(together.expectedReturn),
            volatilityPct: pct1(together.volatility),
            probabilitiesPct: goals.map((g) => ({ goal: g.name, probabilityPct: Math.round(goalProbability(g, together, 10000) * 100) })),
            topWeights: r.assets
              .map((a, i) => ({ symbol: a.symbol, targetPct: pct1(together.weights[i]), currentPct: pct1(a.weight) }))
              .sort((a, b) => (b.targetPct ?? 0) - (a.targetPct ?? 0))
              .slice(0, 5),
          },
          page: '/goals/optimiser',
        };
      },
    }),
    getTaxEstimate: tool({
      description:
        'Indian capital-gains tax picture (FY rules since 23 July 2024): unrealised gains by holding with short/long-term status and days until long-term, tax if everything were sold today (after loss set-off, Rs 1.25 lakh equity LTCG exemption and 4% cess), plus gain-harvesting, wait-to-save and loss-harvesting opportunities. Holdings without a purchase date are listed separately. Use for any tax, LTCG/STCG, "should I wait" or harvesting question.',
      inputSchema: z.object({
        slabRatePct: z.number().min(0).max(30).optional().describe('Income-tax slab in per cent; defaults to the rate implied by the profile income'),
        ltcgAlreadyBookedINR: z.number().nonnegative().optional().describe('Long-term equity gains already booked this financial year'),
      }),
      execute: async ({ slabRatePct, ltcgAlreadyBookedINR }) => {
        const data = await getTaxCentreData(snapshot.summary.userId);
        const opts = { slabRate: slabRatePct != null ? slabRatePct / 100 : data.defaultSlabRate, ltcgAlreadyBooked: ltcgAlreadyBookedINR ?? 0 };
        const positions = data.holdings.map((h) => classifyPosition(h, data.asOf));
        const dated = positions.filter((p) => p.bucket);
        const tax = computeTax(dated, opts);
        const harvest = ltcgHarvestPlan(dated, tax.exemptionLeft + tax.exemptionUsed);
        const round = (x: number) => Math.round(x);
        return {
          financialYear: data.financialYear,
          asOf: data.asOf,
          slabRatePct: Math.round(opts.slabRate * 100),
          slabRateSource: slabRatePct != null ? 'user' : data.slabSource,
          taxIfSoldEverythingTodayINR: round(tax.totalTax),
          taxByBucketINR: Object.fromEntries(Object.entries(tax.tax).map(([k, v]) => [k, round(v)])),
          ltcgExemptionLeftINR: round(Math.max(0, TAX_RULES.ltcgExemption - opts.ltcgAlreadyBooked)),
          lossesToCarryForwardINR: { shortTerm: round(tax.carryForward.shortTerm), longTerm: round(tax.carryForward.longTerm) },
          holdings: positions.map((p) => ({
            symbol: p.symbol,
            type: CATEGORY_LABELS[p.category],
            purchaseDate: p.purchaseDate,
            status: p.excludedReason ?? (p.term === 'long' ? 'long-term' : `short-term, long-term in ${p.daysToLongTerm} days`),
            unrealisedGainINR: round(p.gain),
            taxIfSoldAloneINR: p.bucket ? round(computeTax([p], opts).totalTax) : null,
          })),
          gainHarvesting: {
            gainBookableTaxFreeINR: round(harvest.gainBooked),
            futureTaxSavedINR: round(harvest.futureTaxSaved),
            steps: harvest.suggestions.map((h) => ({ symbol: h.position.symbol, units: Math.round(h.units * 100) / 100, saleValueINR: round(h.saleValue), gainBookedINR: round(h.gainBooked) })),
          },
          waitToSave: waitToSave(dated, opts).map((w) => ({ symbol: w.position.symbol, days: w.days, taxNowINR: round(w.taxNow), taxIfLongTermINR: round(w.taxIfLongTerm) })),
          lossHarvesting: lossHarvest(dated, opts).map((l) => ({ symbol: l.position.symbol, lossINR: round(l.loss), term: l.position.term, taxShieldINR: round(l.taxShield) })),
          missingPurchaseDates: positions.filter((p) => p.excludedReason === 'Purchase date needed').map((p) => p.symbol),
          notes: 'Estimate, not tax advice. Surcharge and pre-2018 grandfathering not modelled. Sovereign Gold Bonds redeemed with RBI are tax-free. Dates can be added on the Tax Centre page (/tax).',
        };
      },
    }),
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
        const cap = (maxWeightPct ?? 35) / 100;
        const f = efficientFrontier(mu, cov, riskFree, cap);
        const target =
          objective === 'min_risk'
            ? f.minVariance
            : objective === 'same_risk_more_return'
              ? frontierAtVolatility(mu, cov, riskFree, cap, current.volatility)
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
  getTaxEstimate: 'Estimated your capital-gains tax',
  optimizeForGoals: 'Ran the goal-based optimiser',
};
