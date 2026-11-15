import 'server-only';
import { getProfileForUser } from './profile';
import { getUserHoldings, calculatePortfolioSummary } from './portfolio';
import { getUserGoals, computeGoalProjection } from './goals';
import type { UserFullProfile } from './profile';
import type { PortfolioSummaryStats, UserHoldingView } from './portfolio';
import type { GoalEntity } from './schema/goals';
import type { GoalProjectionDetails } from './goals';

export interface CashFlowSummary {
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  netSurplus: number | null;
  savingsRatePct: number | null;
  totalGoalSipCommitment: number;
  uncommittedSurplus: number | null;
  hasCashFlowDeficit: boolean;
  deficitAmount: number;
}

export interface EmergencyFundSummary {
  actualAmount: number | null;
  targetMonths: number;
  monthlyExpenses: number | null;
  fundedMonths: number | null;
  targetAmount: number | null;
  shortfallAmount: number;
  isAdequate: boolean;
  coveragePct: number | null;
}

export interface InsuranceSummary {
  termInsuranceCover: number | null;
  healthInsuranceCover: number | null;
  annualIncome: number | null;
  termIncomeMultiplier: number | null;
  isTermAdequate: boolean;
  isHealthAdequate: boolean;
  hasTermCover: boolean;
  hasHealthCover: boolean;
}

export interface GoalAggregatedSummary {
  totalGoalsCount: number;
  totalTargetAmount: number;
  totalCurrentAllocated: number;
  totalMonthlyCommitment: number;
  overallFundingPct: number;
  onTrackCount: number;
  behindCount: number;
  projections: {
    goal: GoalEntity;
    details: GoalProjectionDetails;
  }[];
}

export interface AssetValuationSummary {
  identifiedLiquidAssets: number;
  identifiedInvestedAssets: number;
  totalIdentifiedAssets: number;
  isInvestedFullyPriced: boolean;
  pricingCoveragePct: number;
  disclaimer: string;
  hasUnmodeledLiabilities: boolean;
}

export interface PersonalFinancialSummary {
  userId: string;
  profile: UserFullProfile | null;
  holdings: UserHoldingView[];
  portfolioSummary: PortfolioSummaryStats;
  assets: AssetValuationSummary;
  cashFlow: CashFlowSummary;
  emergencyFund: EmergencyFundSummary;
  insurance: InsuranceSummary;
  goalsSummary: GoalAggregatedSummary;
  completeness: {
    hasIncomeAndExpenses: boolean;
    hasEmergencyFundData: boolean;
    hasInsuranceData: boolean;
    hasInvestments: boolean;
    hasGoals: boolean;
    completedFieldsCount: number;
    totalFieldsCount: number;
    completenessPct: number;
  };
}

/**
 * Compiles a comprehensive personal financial summary strictly scoped to the authenticated user ID.
 * Respects data boundaries and explicitly notes partial liability coverage.
 */
export async function getPersonalFinancialSummary(userId: string): Promise<PersonalFinancialSummary> {
  const [profileResult, holdings, userGoals] = await Promise.all([
    getProfileForUser(userId),
    getUserHoldings(userId),
    getUserGoals(userId),
  ]);

  const portfolioSummary = calculatePortfolioSummary(holdings);

  const fp = profileResult?.financialProfile;

  // 1. Cash flow compilation
  const monthlyIncome = fp?.monthlyIncome ? parseFloat(fp.monthlyIncome) : null;
  const monthlyExpenses = fp?.monthlyExpenses ? parseFloat(fp.monthlyExpenses) : null;

  let netSurplus: number | null = null;
  let savingsRatePct: number | null = null;
  let hasCashFlowDeficit = false;
  let deficitAmount = 0;

  if (monthlyIncome !== null && monthlyExpenses !== null) {
    netSurplus = monthlyIncome - monthlyExpenses;
    if (netSurplus < 0) {
      hasCashFlowDeficit = true;
      deficitAmount = Math.abs(netSurplus);
    }
    if (monthlyIncome > 0) {
      savingsRatePct = Math.round((netSurplus / monthlyIncome) * 100);
    }
  }

  // 2. Emergency fund compilation
  const emergencyFundActual = fp?.emergencyFundActual ? parseFloat(fp.emergencyFundActual) : null;
  const targetMonths = fp?.emergencyFundTargetMonths ?? 6;
  let fundedMonths: number | null = null;
  let emergencyTargetAmount: number | null = null;
  let emergencyShortfall = 0;
  let isEmergencyAdequate = false;
  let emergencyCoveragePct: number | null = null;

  if (emergencyFundActual !== null && monthlyExpenses !== null && monthlyExpenses > 0) {
    fundedMonths = parseFloat((emergencyFundActual / monthlyExpenses).toFixed(1));
    emergencyTargetAmount = monthlyExpenses * targetMonths;
    emergencyCoveragePct = Math.min(100, Math.round((emergencyFundActual / emergencyTargetAmount) * 100));
    emergencyShortfall = Math.max(0, emergencyTargetAmount - emergencyFundActual);
    isEmergencyAdequate = fundedMonths >= targetMonths;
  }

  // 3. Insurance compilation
  const termCover = fp?.termInsuranceCover ? parseFloat(fp.termInsuranceCover) : null;
  const healthCover = fp?.healthInsuranceCover ? parseFloat(fp.healthInsuranceCover) : null;
  const annualIncome = monthlyIncome !== null ? monthlyIncome * 12 : null;
  let termIncomeMultiplier: number | null = null;
  let isTermAdequate = false;

  if (termCover !== null && annualIncome !== null && annualIncome > 0) {
    termIncomeMultiplier = parseFloat((termCover / annualIncome).toFixed(1));
    // Standard rule of thumb: 10x - 15x annual income
    isTermAdequate = termIncomeMultiplier >= 10.0;
  }
  const isHealthAdequate = healthCover !== null && healthCover >= 500000; // >= 5 Lakhs

  // 4. Goals compilation
  let totalTargetAmount = 0;
  let totalCurrentAllocated = 0;
  let totalMonthlyCommitment = 0;
  let onTrackCount = 0;
  let behindCount = 0;

  const currentYear = new Date().getFullYear();
  const goalProjections = userGoals.map((g: GoalEntity) => {
    const details = computeGoalProjection(g, currentYear);
    totalTargetAmount += details.targetAmount;
    totalCurrentAllocated += details.currentAllocatedAmount;
    totalMonthlyCommitment += details.monthlyContribution;
    if (details.onTrack) {
      onTrackCount++;
    } else {
      behindCount++;
    }
    return {
      goal: g,
      details,
    };
  });

  const overallFundingPct = totalTargetAmount > 0
    ? Math.min(100, Math.round((totalCurrentAllocated / totalTargetAmount) * 100))
    : 0;

  const uncommittedSurplus = netSurplus !== null
    ? netSurplus - totalMonthlyCommitment
    : null;

  // 5. Asset valuation compilation
  const identifiedLiquidAssets = emergencyFundActual ?? 0;
  const identifiedInvestedAssets = portfolioSummary.totalCurrentValue !== null
    ? portfolioSummary.totalCurrentValue
    : portfolioSummary.totalInvested;
  const totalIdentifiedAssets = identifiedLiquidAssets + identifiedInvestedAssets;

  const pricingCoveragePct = portfolioSummary.holdingCount > 0
    ? Math.round((portfolioSummary.pricedHoldingCount / portfolioSummary.holdingCount) * 100)
    : 100;

  const disclaimer = 'Identified Liquid & Invested Assets (Excluding Unmodeled Liabilities). Outstanding loans, mortgages, or credit balances are not currently tracked in the database.';

  // 6. Completeness calculation
  const hasIncomeAndExpenses = monthlyIncome !== null && monthlyExpenses !== null;
  const hasEmergencyFundData = emergencyFundActual !== null;
  const hasInsuranceData = termCover !== null || healthCover !== null;
  const hasInvestments = portfolioSummary.holdingCount > 0;
  const hasGoals = userGoals.length > 0;

  const fields = [
    hasIncomeAndExpenses,
    hasEmergencyFundData,
    hasInsuranceData,
    hasInvestments,
    hasGoals,
  ];
  const completedFieldsCount = fields.filter(Boolean).length;
  const totalFieldsCount = fields.length;
  const completenessPct = Math.round((completedFieldsCount / totalFieldsCount) * 100);

  return {
    userId,
    profile: profileResult,
    holdings,
    portfolioSummary,
    assets: {
      identifiedLiquidAssets,
      identifiedInvestedAssets,
      totalIdentifiedAssets,
      isInvestedFullyPriced: portfolioSummary.isFullyPriced,
      pricingCoveragePct,
      disclaimer,
      hasUnmodeledLiabilities: true,
    },
    cashFlow: {
      monthlyIncome,
      monthlyExpenses,
      netSurplus,
      savingsRatePct,
      totalGoalSipCommitment: totalMonthlyCommitment,
      uncommittedSurplus,
      hasCashFlowDeficit,
      deficitAmount,
    },
    emergencyFund: {
      actualAmount: emergencyFundActual,
      targetMonths,
      monthlyExpenses,
      fundedMonths,
      targetAmount: emergencyTargetAmount,
      shortfallAmount: emergencyShortfall,
      isAdequate: isEmergencyAdequate,
      coveragePct: emergencyCoveragePct,
    },
    insurance: {
      termInsuranceCover: termCover,
      healthInsuranceCover: healthCover,
      annualIncome,
      termIncomeMultiplier,
      isTermAdequate,
      isHealthAdequate,
      hasTermCover: termCover !== null && termCover > 0,
      hasHealthCover: healthCover !== null && healthCover > 0,
    },
    goalsSummary: {
      totalGoalsCount: userGoals.length,
      totalTargetAmount,
      totalCurrentAllocated,
      totalMonthlyCommitment,
      overallFundingPct,
      onTrackCount,
      behindCount,
      projections: goalProjections,
    },
    completeness: {
      hasIncomeAndExpenses,
      hasEmergencyFundData,
      hasInsuranceData,
      hasInvestments,
      hasGoals,
      completedFieldsCount,
      totalFieldsCount,
      completenessPct,
    },
  };
}
