import 'server-only';
import { calculateXRayAnalytics } from './xray';
import type { PersonalFinancialSummary } from './financial-summary';
import {
  HEALTH_SCORE_ENGINE_VERSION,
  evaluateHealthScores,
  type PillarStatus,
  type EvaluatedPillar,
  type RiskDiagnostic,
  type HealthEngineOutput as FinancialHealthAssessment,
} from '@/lib/math/health-engine';

export {
  HEALTH_SCORE_ENGINE_VERSION,
  type PillarStatus,
  type EvaluatedPillar,
  type RiskDiagnostic,
  type FinancialHealthAssessment,
};

/**
 * Versioned, transparent Financial Health Scoring engine.
 * Computes 5 core pillars with dynamic re-normalization for unassessed categories.
 */
export function calculateFinancialHealth(
  summary: PersonalFinancialSummary
): FinancialHealthAssessment {
  const { profile, holdings, portfolioSummary, cashFlow, emergencyFund, insurance, goalsSummary } = summary;

  // Derive X-Ray analytics if holdings exist
  let hhi: number | null = null;
  let top1WeightPct: number | null = null;
  let assetClassCount = 0;

  // Cost basis of holdings that have no verified price (excluded from valuation).
  const unpricedInvestedAmount = holdings
    .filter((h) => h.currentValue == null)
    .reduce((sum, h) => sum + h.investedAmount, 0);
  const pricedCostShare = portfolioSummary.totalInvested > 0
    ? 1 - unpricedInvestedAmount / portfolioSummary.totalInvested
    : 0;

  if (holdings.length > 0) {
    const xray = calculateXRayAnalytics(holdings, summary.userId);
    // Concentration is only meaningful when most of the portfolio (by cost) is verified-priced.
    // Otherwise HHI would describe a small subset and produce a misleading diagnosis.
    if (pricedCostShare >= 0.5) {
      hhi = xray.concentration.hhi;
      top1WeightPct = xray.concentration.top1WeightPct;
    }
    assetClassCount = xray.assetClassAllocations.length;
  }

  return evaluateHealthScores({
    monthlyIncome: cashFlow.monthlyIncome,
    monthlyExpenses: cashFlow.monthlyExpenses,
    emergencyFundActual: emergencyFund.actualAmount,
    emergencyFundTargetMonths: emergencyFund.targetMonths,
    holdingsCount: portfolioSummary.holdingCount,
    hhi,
    top1WeightPct,
    assetClassCount,
    unpricedHoldingCount: portfolioSummary.unpricedHoldingCount,
    unpricedInvestedAmount,
    termInsuranceCover: insurance.termInsuranceCover,
    healthInsuranceCover: insurance.healthInsuranceCover,
    goalsCount: goalsSummary.totalGoalsCount,
    overallFundingPct: goalsSummary.overallFundingPct,
    onTrackGoalsCount: goalsSummary.onTrackCount,
    behindGoalsCount: goalsSummary.behindCount,
  });
}
