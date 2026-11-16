import 'server-only';
import { getPersonalFinancialSummary, type PersonalFinancialSummary } from '@/lib/db/financial-summary';
import { calculateXRayAnalytics, type XRayAnalytics } from '@/lib/db/xray';
import { calculateFinancialHealth, type FinancialHealthAssessment } from '@/lib/db/health';
import { getPortfolioPerformance, type PortfolioPerformance } from '@/lib/db/performance';
import { portfolioAssumptions, simulateGoalFromDetails, type GoalSimulation } from '@/lib/db/goal-simulation';

export interface FinancialSnapshot {
  summary: PersonalFinancialSummary;
  xray: XRayAnalytics | null;
  health: FinancialHealthAssessment;
  performance: PortfolioPerformance | null;
  assumptions: ReturnType<typeof portfolioAssumptions>;
  goalSimulations: Array<{ goalId: string; simulation: GoalSimulation | null }>;
}

/** Loads every verified analytic for a user once, for AI features to read from. */
export async function loadFinancialSnapshot(userId: string): Promise<FinancialSnapshot> {
  const summary = await getPersonalFinancialSummary(userId);
  const xray = summary.holdings.length > 0 ? calculateXRayAnalytics(summary.holdings, userId) : null;
  const health = calculateFinancialHealth(summary);
  const performance = await getPortfolioPerformance(summary.holdings).catch(() => null);
  const assumptions = portfolioAssumptions(summary.holdings, performance?.assetClassStats ?? []);
  const goalSimulations = summary.goalsSummary.projections.map((p, i) => ({
    goalId: p.goal.id,
    simulation: simulateGoalFromDetails(p.details, assumptions, i),
  }));
  return { summary, xray, health, performance, assumptions, goalSimulations };
}

const r0 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
const r1 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

export function portfolioOverview(s: FinancialSnapshot) {
  const ps = s.summary.portfolioSummary;
  return {
    holdingsCount: ps.holdingCount,
    accountsCount: ps.accountCount,
    totalInvestedINR: r0(ps.totalInvested),
    verifiedMarketValueINR: r0(ps.totalCurrentValue),
    pricedCostBasisINR: r0(ps.pricedInvested),
    /** Gain on the priced holdings only: verifiedMarketValueINR minus pricedCostBasisINR. */
    unrealisedGainINR: r0(ps.totalUnrealizedGain),
    unrealisedGainPct: r1(ps.totalUnrealizedGainPct),
    pricedHoldings: ps.pricedHoldingCount,
    unpricedHoldings: ps.unpricedHoldingCount,
    latestPriceDate: ps.latestPriceTimestamp ? new Date(ps.latestPriceTimestamp).toISOString().slice(0, 10) : null,
    xirrPct: r1(s.performance?.xirrPct ?? null),
    oneYearPortfolioReturnPct: r1(s.performance?.portfolioReturn1yPct ?? null),
    oneYearNifty50ReturnPct: r1(s.performance?.benchmarkReturnPct ?? null),
    allocationByAssetClass: (s.xray?.assetClassAllocations ?? []).map((a) => ({
      assetClass: a.assetClass,
      valueINR: r0(a.verifiedValue),
      weightPct: r1(a.verifiedWeightPct),
      costBasisINR: r0(a.costBasis),
    })),
  };
}

export function holdingsList(s: FinancialSnapshot, assetClass?: string) {
  const total = s.summary.portfolioSummary.totalCurrentValue ?? 0;
  return s.summary.holdings
    .filter((h) => !assetClass || h.assetClass.toLowerCase() === assetClass.toLowerCase())
    .map((h) => ({
      name: h.name,
      symbol: h.symbol,
      assetClass: h.assetClass,
      sector: h.sector,
      account: h.accountName,
      units: h.units,
      averageCostINR: r1(h.averageAcquisitionCost),
      investedINR: r0(h.investedAmount),
      latestPriceINR: h.currentPrice,
      priceSource: h.currentValue != null ? h.priceSource : 'awaiting verified price',
      priceDate: h.priceTimestamp ? new Date(h.priceTimestamp).toISOString().slice(0, 10) : null,
      marketValueINR: r0(h.currentValue),
      gainPct: r1(h.unrealizedGainPct),
      weightPct: h.currentValue != null && total > 0 ? r1((h.currentValue / total) * 100) : null,
    }));
}

export function xrayDigest(s: FinancialSnapshot) {
  if (!s.xray) return { available: false };
  const c = s.xray.concentration;
  return {
    available: true,
    hhi: r0(c.hhi),
    concentrationLabel: c.hhiClassification,
    largestPositionPct: r1(c.top1WeightPct),
    top3Pct: r1(c.top3WeightPct),
    top5Pct: r1(c.top5WeightPct),
    sectors: s.xray.sectorExposures.slice(0, 8).map((x) => ({ sector: x.sector, weightPct: r1(x.verifiedWeightPct) })),
    marketCap: s.xray.marketCapExposures.map((m) => ({ bucket: m.category, weightPct: r1(m.verifiedWeightPct) })),
    insights: s.xray.practicalInsights.map((i) => i.title + ': ' + i.description),
    note: 'Weights use verified-priced holdings only.',
  };
}

export function healthDigest(s: FinancialSnapshot) {
  const h = s.health;
  return {
    score: h.overallScore,
    rating: h.ratingLabel,
    coveragePct: h.coveragePct,
    confidence: h.confidence,
    pillars: h.pillars.map((p) => ({
      pillar: p.label,
      assessed: p.isAssessed,
      score: p.isAssessed ? p.score : null,
      weightPct: r1(p.normalizedWeight * 100),
      metric: `${p.metricLabel}: ${p.metricValue}`,
      insight: p.insight,
      recommendation: p.recommendation,
    })),
    diagnostics: h.diagnostics.map((d) => ({ severity: d.severity, title: d.title, description: d.description })),
    profile: {
      monthlyIncomeINR: s.summary.cashFlow.monthlyIncome,
      monthlyExpensesINR: s.summary.cashFlow.monthlyExpenses,
      savingsRatePct: s.summary.cashFlow.savingsRatePct,
      emergencyFundMonths: s.summary.emergencyFund.fundedMonths,
      termCoverMultipleOfIncome: s.summary.insurance.termIncomeMultiplier,
    },
  };
}

export function goalsDigest(s: FinancialSnapshot) {
  return s.summary.goalsSummary.projections.map((p) => {
    const sim = s.goalSimulations.find((g) => g.goalId === p.goal.id)?.simulation ?? null;
    const d = p.details;
    return {
      name: p.goal.name,
      category: p.goal.category,
      targetINR: r0(d.targetAmount),
      inflationAdjustedTargetINR: r0(d.inflationAdjustedTarget),
      deadline: d.deadlineDate,
      monthsRemaining: d.monthsRemaining,
      currentCorpusINR: r0(d.currentAllocatedAmount),
      monthlySipINR: r0(d.monthlyContribution),
      requiredSipAt10PctINR: r0(d.requiredMonthlySavings),
      baselineProjectionINR: r0(d.scenarios.baseline.projectedFutureValue),
      deterministicStatus: d.onTrack ? 'on track' : 'behind',
      feasibility: d.scenarioFeasibility,
      monteCarloProbabilityPct: sim ? Math.round(sim.nominal.probabilityOfSuccess * 100) : null,
      monteCarloInflationAdjustedProbabilityPct: sim ? Math.round(sim.inflationAdjustedProbability * 100) : null,
      monteCarloMedianINR: sim ? r0(sim.nominal.p50) : null,
    };
  });
}
