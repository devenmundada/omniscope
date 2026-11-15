/**
 * Pure Mathematical Engine for OmniScope Financial Health Scoring.
 * Implements versioned 5-pillar scoring with dynamic weight re-normalization
 * so unassessed pillars never unfairly penalize the user.
 * 
 * NOTE: Historical longitudinal tracking requires periodic persisted snapshots over time.
 * In the current schema, there is no historical health snapshot table;
 * calculations represent the user's live verified baseline assessment.
 */

export const HEALTH_SCORE_ENGINE_VERSION = '1.0.0';

export type PillarStatus = 'strong' | 'fair' | 'weak' | 'unassessed';

export interface EvaluatedPillar {
  id: 'emergency' | 'savings' | 'diversification' | 'protection' | 'goals';
  label: string;
  question: string;
  score: number; // 0-100 (0 if unassessed)
  baseWeight: number; // e.g. 0.25
  normalizedWeight: number; // dynamically re-weighted among assessed pillars
  status: PillarStatus;
  isAssessed: boolean;
  insight: string;
  metricLabel: string;
  metricValue: string;
  recommendation: string;
}

export interface RiskDiagnostic {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  category: 'CASH_FLOW' | 'EMERGENCY_FUND' | 'CONCENTRATION' | 'UNPRICED_ASSETS' | 'GOALS' | 'PROTECTION';
  actionableStep: string;
}

export interface PureHealthInput {
  // 1. Cash flow & Emergency fund
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  emergencyFundActual?: number | null;
  emergencyFundTargetMonths?: number;

  // 2. Diversification & Concentration (from portfolio X-Ray)
  holdingsCount?: number;
  hhi?: number | null;
  top1WeightPct?: number | null;
  assetClassCount?: number;
  unpricedHoldingCount?: number;
  unpricedInvestedAmount?: number;

  // 3. Protection (Insurance)
  termInsuranceCover?: number | null;
  healthInsuranceCover?: number | null;

  // 4. Goals
  goalsCount?: number;
  overallFundingPct?: number;
  onTrackGoalsCount?: number;
  behindGoalsCount?: number;
}

export interface HealthEngineOutput {
  engineVersion: string;
  overallScore: number | null;
  ratingLabel: string;
  ratingDescription: string;
  assessedPillarsCount: number;
  totalPillarsCount: number;
  coveragePct: number;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceNote: string;
  pillars: EvaluatedPillar[];
  weakestPillar: EvaluatedPillar | null;
  strongestPillar: EvaluatedPillar | null;
  diagnostics: RiskDiagnostic[];
  hasHistoricalTimeline: boolean;
  historicalTrackingDisclosure: string;
  methodologyDisclosure: string;
}

export const BASE_PILLAR_WEIGHTS = {
  emergency: 0.25,
  savings: 0.20,
  diversification: 0.20,
  protection: 0.15,
  goals: 0.20,
} as const;

export function evaluateHealthScores(input: PureHealthInput): HealthEngineOutput {
  const {
    monthlyIncome = null,
    monthlyExpenses = null,
    emergencyFundActual = null,
    emergencyFundTargetMonths = 6,
    holdingsCount = 0,
    hhi = null,
    top1WeightPct = null,
    assetClassCount = 0,
    unpricedHoldingCount = 0,
    unpricedInvestedAmount = 0,
    termInsuranceCover = null,
    healthInsuranceCover = null,
    goalsCount = 0,
    overallFundingPct = 0,
    onTrackGoalsCount = 0,
    behindGoalsCount = 0,
  } = input;

  // 1. Emergency Fund Pillar (Base Weight 0.25)
  let emergencyScore = 0;
  let emergencyStatus: PillarStatus = 'unassessed';
  let emergencyIsAssessed = false;
  let emergencyInsight = 'Add monthly living expenses and emergency savings to your profile to evaluate this pillar.';
  let emergencyMetricLabel = 'Coverage';
  let emergencyMetricValue = 'Unassessed';
  let emergencyRecommendation = 'Build 6 months of living expenses in an instant-access savings account or liquid fund.';
  let fundedMonths: number | null = null;
  let emergencyShortfall = 0;

  if (emergencyFundActual !== null && monthlyExpenses !== null && monthlyExpenses > 0) {
    emergencyIsAssessed = true;
    fundedMonths = parseFloat((emergencyFundActual / monthlyExpenses).toFixed(1));
    const targetMonths = emergencyFundTargetMonths > 0 ? emergencyFundTargetMonths : 6;
    emergencyScore = Math.min(100, Math.round((fundedMonths / targetMonths) * 100));
    emergencyMetricLabel = 'Buffer';
    emergencyMetricValue = `${fundedMonths.toFixed(1)} / ${targetMonths} mo`;
    const targetAmount = monthlyExpenses * targetMonths;
    emergencyShortfall = Math.max(0, targetAmount - emergencyFundActual);

    if (emergencyScore >= 80) {
      emergencyStatus = 'strong';
      emergencyInsight = `You hold ${fundedMonths.toFixed(1)} months of expenses in liquid reserves. This is a robust foundation for market drawdowns.`;
      emergencyRecommendation = 'Maintain this reserve and calibrate it annually against lifestyle inflation.';
    } else if (emergencyScore >= 50) {
      emergencyStatus = 'fair';
      emergencyInsight = `You currently have ${fundedMonths.toFixed(1)} months of buffer toward your ${targetMonths}-month target. A surprise expense could disrupt investments.`;
      emergencyRecommendation = `Route ₹${(emergencyShortfall / 100000).toFixed(1)}L into liquid reserves before expanding high-risk equity positions.`;
    } else {
      emergencyStatus = 'weak';
      emergencyInsight = `Your liquid reserves cover only ${fundedMonths.toFixed(1)} months of expenses. You are vulnerable to sudden liquidity shocks.`;
      emergencyRecommendation = 'Temporarily direct monthly savings into high-yield liquid funds until you achieve 3 months of baseline coverage.';
    }
  }

  // 2. Savings Rate Pillar (Base Weight 0.20)
  let savingsScore = 0;
  let savingsStatus: PillarStatus = 'unassessed';
  let savingsIsAssessed = false;
  let savingsInsight = 'Enter your monthly take-home income and expenses to assess your savings rate.';
  let savingsMetricLabel = 'Savings Rate';
  let savingsMetricValue = 'Unassessed';
  let savingsRecommendation = 'Aim to invest at least 20-30% of take-home income every month.';
  let netSurplus: number | null = null;
  let hasCashFlowDeficit = false;
  let deficitAmount = 0;

  if (monthlyIncome !== null && monthlyExpenses !== null && monthlyIncome > 0) {
    savingsIsAssessed = true;
    netSurplus = monthlyIncome - monthlyExpenses;
    const rate = netSurplus / monthlyIncome;
    const ratePct = Math.round(rate * 100);
    savingsMetricValue = `${ratePct}%`;

    if (netSurplus < 0) {
      hasCashFlowDeficit = true;
      deficitAmount = Math.abs(netSurplus);
      savingsScore = 15;
      savingsStatus = 'weak';
      savingsInsight = `Your monthly spending exceeds your income by ₹${deficitAmount.toLocaleString('en-IN')}. Operating in a cash-flow deficit erodes capital.`;
      savingsRecommendation = 'Conduct an immediate expense audit to eliminate discretionary leakage and halt debt accumulation.';
    } else if (rate < 0.15) {
      savingsScore = Math.round(15 + (rate / 0.15) * 45); // 15 - 60
      savingsStatus = 'weak';
      savingsInsight = `You are saving ${ratePct}% of income. While positive, building lasting financial independence typically requires saving at least 20%.`;
      savingsRecommendation = 'Target a 5% reduction in recurring subscriptions and variable lifestyle costs.';
    } else if (rate < 0.30) {
      savingsScore = Math.round(60 + ((rate - 0.15) / 0.15) * 25); // 60 - 85
      savingsStatus = 'fair';
      savingsInsight = `You are saving ${ratePct}% of income. You are paying your future self a consistent share of earnings.`;
      savingsRecommendation = 'Adopt a 10% annual Step-Up SIP alongside salary revisions to reach 30%+ savings.';
    } else {
      savingsScore = Math.min(100, Math.round(85 + ((rate - 0.30) / 0.20) * 15)); // 85 - 100
      savingsStatus = 'strong';
      savingsInsight = `Outstanding discipline: you invest ${ratePct}% of your monthly earnings. This places you in the top tier of wealth builders.`;
      savingsRecommendation = 'Ensure ongoing cash flow is deployed systematically into diversified asset classes.';
    }
  }

  // 3. Diversification & Concentration Pillar (Base Weight 0.20)
  let divScore = 0;
  let divStatus: PillarStatus = 'unassessed';
  let divIsAssessed = false;
  let divInsight = 'Import your portfolio or add holdings to evaluate diversification and concentration.';
  let divMetricLabel = 'HHI Concentration';
  let divMetricValue = 'Unassessed';
  let divRecommendation = 'Spread investments across multiple non-correlated asset classes and prevent single-stock dominance.';
  if (holdingsCount > 0 && hhi === null) {
    divInsight = 'Less than half of your portfolio (by cost) has a verified market price yet, so concentration is not scored to avoid a misleading result.';
    divRecommendation = 'Run "Sync Prices" on the Portfolio page; the pillar is assessed automatically once verified prices arrive.';
  }

  if (holdingsCount > 0 && hhi !== null) {
    divIsAssessed = true;
    let baseDivScore = 70;
    if (hhi <= 1500) {
      baseDivScore = Math.round(100 - (hhi / 1500) * 15); // 85 - 100
    } else if (hhi <= 2500) {
      baseDivScore = Math.round(85 - ((hhi - 1500) / 1000) * 20); // 65 - 85
    } else {
      baseDivScore = Math.max(25, Math.round(65 - ((hhi - 2500) / 2500) * 35)); // 25 - 65
    }

    if (assetClassCount >= 3) baseDivScore = Math.min(100, baseDivScore + 5);
    if (assetClassCount <= 1) baseDivScore = Math.max(20, baseDivScore - 15);

    const unpricedPct = (unpricedHoldingCount / Math.max(1, holdingsCount)) * 100;
    if (unpricedPct > 25) {
      baseDivScore = Math.max(20, baseDivScore - 10);
    }

    divScore = Math.round(baseDivScore);
    divMetricValue = `${hhi.toFixed(0)}`;

    if (divScore >= 75) {
      divStatus = 'strong';
      divInsight = `Your portfolio shows healthy diversification with an HHI of ${hhi.toFixed(0)} across ${assetClassCount} asset classes.`;
      divRecommendation = 'Maintain balanced sector allocation and rebalance when single holdings drift above 15%.';
    } else if (divScore >= 55) {
      divStatus = 'fair';
      divInsight = `Moderate concentration: top holding is ${top1WeightPct?.toFixed(1) ?? 'significant'}% of your portfolio.`;
      divRecommendation = 'Direct fresh SIP inflows into underweighted asset classes to dilute top-holding concentration.';
    } else {
      divStatus = 'weak';
      divInsight = `High portfolio concentration: top holding is ${top1WeightPct?.toFixed(1) ?? 'dominant'}% of assets (HHI: ${hhi.toFixed(0)}).`;
      divRecommendation = 'Systematically trim or dilute top holdings to prevent single-event company drawdown risks.';
    }
  }

  // 4. Protection (Insurance) Pillar (Base Weight 0.15)
  let protScore = 0;
  let protStatus: PillarStatus = 'unassessed';
  let protIsAssessed = false;
  let protInsight = 'Enter your term life and health insurance coverage to assess your family protection shield.';
  let protMetricLabel = 'Term Multiplier';
  let protMetricValue = 'Unassessed';
  let protRecommendation = 'Secure 10-15x annual income in term life insurance and comprehensive health cover.';
  let termMultiplier: number | null = null;
  const annualIncome = monthlyIncome !== null ? monthlyIncome * 12 : null;

  if (termInsuranceCover !== null || healthInsuranceCover !== null) {
    protIsAssessed = true;
    let termComponent = 50;
    let healthComponent = 50;

    if (termInsuranceCover !== null && annualIncome !== null && annualIncome > 0) {
      termMultiplier = parseFloat((termInsuranceCover / annualIncome).toFixed(1));
      termComponent = Math.min(100, Math.round((termMultiplier / 12) * 100));
    } else if (termInsuranceCover !== null && termInsuranceCover > 0) {
      termComponent = 70;
    } else {
      termComponent = 20;
    }

    if (healthInsuranceCover !== null && healthInsuranceCover >= 500000) {
      healthComponent = 100;
    } else if (healthInsuranceCover !== null && healthInsuranceCover > 0) {
      healthComponent = 65;
    } else {
      healthComponent = 20;
    }

    protScore = Math.round(termComponent * 0.6 + healthComponent * 0.4);
    protMetricValue = termMultiplier !== null ? `${termMultiplier.toFixed(1)}x Income` : 'Recorded';

    if (protScore >= 75) {
      protStatus = 'strong';
      protInsight = 'Your family shield is well protected with adequate term insurance and active health coverage.';
      protRecommendation = 'Review policy terms every 3-5 years or when significant life events occur.';
    } else if (protScore >= 50) {
      protStatus = 'fair';
      protInsight = `Term life coverage is ${termMultiplier ? termMultiplier.toFixed(1) + 'x' : 'below target'} (benchmark: 10-15x annual income).`;
      protRecommendation = 'Consider adding pure term life insurance to close the income replacement gap.';
    } else {
      protStatus = 'weak';
      protInsight = 'Your protection coverage is critically low or incomplete relative to your family income needs.';
      protRecommendation = 'Prioritize obtaining comprehensive health insurance and adequate term life insurance immediately.';
    }
  }

  // 5. Goal Coverage & Progress Pillar (Base Weight 0.20)
  let goalScore = 0;
  let goalStatus: PillarStatus = 'unassessed';
  let goalIsAssessed = false;
  let goalInsight = 'Create your financial goals (retirement, housing, education) to assess funding progress.';
  let goalMetricLabel = 'Funded / On Track';
  let goalMetricValue = '0 Active';
  let goalRecommendation = 'Define target dates and monthly SIP amounts for your primary financial goals.';

  if (goalsCount > 0) {
    goalIsAssessed = true;
    const onTrackRatio = onTrackGoalsCount / goalsCount;
    goalScore = Math.min(100, Math.round(overallFundingPct * 0.4 + (onTrackRatio * 100) * 0.6));
    goalMetricValue = `${overallFundingPct}% (${onTrackGoalsCount}/${goalsCount} on track)`;

    if (goalScore >= 75) {
      goalStatus = 'strong';
      goalInsight = `${onTrackGoalsCount} of ${goalsCount} goals are comfortably on track with adequate monthly SIP commitments.`;
      goalRecommendation = 'Maintain current SIP allocations and review milestone dates annually.';
    } else if (goalScore >= 50) {
      goalStatus = 'fair';
      goalInsight = `You have funded ${overallFundingPct}% of target goals, but ${behindGoalsCount} goal(s) have projected contribution shortfalls.`;
      goalRecommendation = 'Increase monthly contributions to lagging goals or extend target horizons by 1-2 years.';
    } else {
      goalStatus = 'weak';
      goalInsight = `Most goals are currently off-track or under-funded relative to their target milestones.`;
      goalRecommendation = 'Re-prioritize high-importance goals and adjust monthly contributions to match required compounding targets.';
    }
  }

  // Compile raw pillars
  const rawPillars: Array<{
    id: 'emergency' | 'savings' | 'diversification' | 'protection' | 'goals';
    label: string;
    question: string;
    score: number;
    baseWeight: number;
    status: PillarStatus;
    isAssessed: boolean;
    insight: string;
    metricLabel: string;
    metricValue: string;
    recommendation: string;
  }> = [
    {
      id: 'emergency',
      label: 'Emergency Fund',
      question: 'Can you handle an unexpected shock?',
      score: emergencyScore,
      baseWeight: BASE_PILLAR_WEIGHTS.emergency,
      status: emergencyStatus,
      isAssessed: emergencyIsAssessed,
      insight: emergencyInsight,
      metricLabel: emergencyMetricLabel,
      metricValue: emergencyMetricValue,
      recommendation: emergencyRecommendation,
    },
    {
      id: 'savings',
      label: 'Savings Rate',
      question: 'Are you paying your future self?',
      score: savingsScore,
      baseWeight: BASE_PILLAR_WEIGHTS.savings,
      status: savingsStatus,
      isAssessed: savingsIsAssessed,
      insight: savingsInsight,
      metricLabel: savingsMetricLabel,
      metricValue: savingsMetricValue,
      recommendation: savingsRecommendation,
    },
    {
      id: 'diversification',
      label: 'Diversification & Risk',
      question: 'Is your wealth safely spread across assets?',
      score: divScore,
      baseWeight: BASE_PILLAR_WEIGHTS.diversification,
      status: divStatus,
      isAssessed: divIsAssessed,
      insight: divInsight,
      metricLabel: divMetricLabel,
      metricValue: divMetricValue,
      recommendation: divRecommendation,
    },
    {
      id: 'protection',
      label: 'Protection & Shield',
      question: 'Is your family protected against catastrophe?',
      score: protScore,
      baseWeight: BASE_PILLAR_WEIGHTS.protection,
      status: protStatus,
      isAssessed: protIsAssessed,
      insight: protInsight,
      metricLabel: protMetricLabel,
      metricValue: protMetricValue,
      recommendation: protRecommendation,
    },
    {
      id: 'goals',
      label: 'Goal Progress',
      question: 'Are your long-term dreams properly funded?',
      score: goalScore,
      baseWeight: BASE_PILLAR_WEIGHTS.goals,
      status: goalStatus,
      isAssessed: goalIsAssessed,
      insight: goalInsight,
      metricLabel: goalMetricLabel,
      metricValue: goalMetricValue,
      recommendation: goalRecommendation,
    },
  ];

  // Dynamic weight re-normalization
  const assessedPillars = rawPillars.filter((p) => p.isAssessed);
  const totalAssessedBaseWeight = assessedPillars.reduce((sum, p) => sum + p.baseWeight, 0);

  const pillars: EvaluatedPillar[] = rawPillars.map((p) => {
    let normalizedWeight = 0;
    if (p.isAssessed && totalAssessedBaseWeight > 0) {
      normalizedWeight = parseFloat((p.baseWeight / totalAssessedBaseWeight).toFixed(4));
    }
    return {
      ...p,
      normalizedWeight,
    };
  });

  let overallScore: number | null = null;
  if (assessedPillars.length > 0 && totalAssessedBaseWeight > 0) {
    const weightedSum = pillars
      .filter((p) => p.isAssessed)
      .reduce((sum, p) => sum + p.score * p.normalizedWeight, 0);
    overallScore = Math.min(100, Math.max(0, Math.round(weightedSum)));
  }

  const coveragePct = Math.round((assessedPillars.length / rawPillars.length) * 100);

  let confidence: 'High' | 'Medium' | 'Low' = 'Low';
  let confidenceNote = 'Preliminary evaluation: fill in your income, expenses, and insurance in your profile to complete your assessment.';
  if (coveragePct >= 80) {
    confidence = 'High';
    confidenceNote = 'Robust assessment: 4 or more financial pillars are fully populated with verified user data.';
  } else if (coveragePct >= 50) {
    confidence = 'Medium';
    confidenceNote = `Moderate coverage (${coveragePct}%): Some pillars are unassessed. Weight has been dynamically re-allocated so you are not penalized for unentered fields.`;
  }

  let ratingLabel = 'Under Review';
  let ratingDescription = 'Complete your financial profile to receive a full financial health diagnostic.';
  if (overallScore !== null) {
    if (overallScore >= 80) {
      ratingLabel = 'Strong and Resilient';
      ratingDescription = 'You have built an exceptionally sturdy financial foundation with disciplined habits and balanced risk.';
    } else if (overallScore >= 65) {
      ratingLabel = 'Solid, with Room to Grow';
      ratingDescription = 'Your fundamentals are healthy, but targeted improvements in lower-scoring pillars will accelerate financial freedom.';
    } else if (overallScore >= 45) {
      ratingLabel = 'Moderate — Needs Attention';
      ratingDescription = 'Several critical financial areas require strengthening to prevent liquidity stress during market volatility.';
    } else {
      ratingLabel = 'Vulnerable Foundation';
      ratingDescription = 'Immediate intervention is advised in core savings and emergency reserves to stabilize financial security.';
    }
  }

  const sortedAssessed = [...assessedPillars].sort((a, b) => a.score - b.score);
  const weakestPillar = sortedAssessed.length > 0 ? (pillars.find((p) => p.id === sortedAssessed[0].id) || null) : null;
  const strongestPillar = sortedAssessed.length > 0 ? (pillars.find((p) => p.id === sortedAssessed[sortedAssessed.length - 1].id) || null) : null;

  // Diagnostics
  const diagnostics: RiskDiagnostic[] = [];

  if (hasCashFlowDeficit) {
    diagnostics.push({
      id: 'deficit-spending',
      severity: 'high',
      title: 'Cash Flow Deficit Detected',
      description: `Monthly living expenses (₹${(monthlyExpenses || 0).toLocaleString('en-IN')}) exceed verified income (₹${(monthlyIncome || 0).toLocaleString('en-IN')}) by ₹${deficitAmount.toLocaleString('en-IN')}/mo.`,
      category: 'CASH_FLOW',
      actionableStep: 'Audit variable expenses immediately to halt negative cash flow before liquid buffers are depleted.',
    });
  }

  if (fundedMonths !== null && fundedMonths < emergencyFundTargetMonths) {
    diagnostics.push({
      id: 'emergency-buffer-shortfall',
      severity: fundedMonths < 3 ? 'high' : 'medium',
      title: 'Emergency Fund Below Target',
      description: `You have ${fundedMonths.toFixed(1)} months of emergency buffer versus your target of ${emergencyFundTargetMonths} months (shortfall: ₹${emergencyShortfall.toLocaleString('en-IN')}).`,
      category: 'EMERGENCY_FUND',
      actionableStep: 'Prioritize building 6 months of living expenses in an instant-access bank account or liquid fund before adding high-volatility equity.',
    });
  }

  if (holdingsCount > 0 && hhi !== null) {
    if (hhi > 2500) {
      diagnostics.push({
        id: 'portfolio-concentration',
        severity: 'high',
        title: 'Elevated Single-Stock / Sector Concentration',
        description: `Your portfolio Herfindahl-Hirschman Index (HHI) is ${hhi.toFixed(0)}, indicating substantial asset concentration. Top holding is ${top1WeightPct?.toFixed(1) ?? 'high'}% of your portfolio.`,
        category: 'CONCENTRATION',
        actionableStep: 'Direct upcoming SIPs and dividend reinvestments into diversified broad-market index funds to dilute single-holding exposure.',
      });
    }

    if (unpricedHoldingCount > 0) {
      diagnostics.push({
        id: 'unpriced-assets',
        severity: 'medium',
        title: 'Unpriced Holdings Exposure',
        description: `${unpricedHoldingCount} holding(s) currently lack verified end-of-day market quotations (₹${(unpricedInvestedAmount / 100000).toFixed(1)}L at cost basis). They are excluded from market-value percentages until a verified price arrives.`,
        category: 'UNPRICED_ASSETS',
        actionableStep: 'Check symbol mappings or trigger a market data sync to ensure full mark-to-market accuracy.',
      });
    }
  }

  if (behindGoalsCount > 0) {
    diagnostics.push({
      id: 'goals-funding-gap',
      severity: 'medium',
      title: 'Goal Funding Shortfall',
      description: `${behindGoalsCount} of your ${goalsCount} financial goal(s) are projected to fall short at current monthly SIP rates.`,
      category: 'GOALS',
      actionableStep: 'Inspect the Goals view to see required SIP increments and adjust monthly contributions accordingly.',
    });
  }

  if (annualIncome !== null && annualIncome > 0 && (termInsuranceCover === null || (termMultiplier ?? 0) < 10)) {
    diagnostics.push({
      id: 'protection-gap',
      severity: termInsuranceCover !== null && termInsuranceCover > 0 ? 'medium' : 'high',
      title: 'Term Life Insurance Protection Gap',
      description: termMultiplier !== null
        ? `Your current term life cover is ${termMultiplier.toFixed(1)}x your annual income (recommended: 10x-15x).`
        : 'No term life insurance cover has been recorded for your profile.',
      category: 'PROTECTION',
      actionableStep: 'Obtain pure term life insurance equal to at least 10x annual income to protect dependents from financial hardship.',
    });
  }

  const historicalTrackingDisclosure = 'Longitudinal health trajectory tracking records monthly health snapshots over time as you complete recurring reviews. Currently displaying your live verified baseline assessment (v1.0.0).';

  const methodologyDisclosure = `Health Score Engine v${HEALTH_SCORE_ENGINE_VERSION}. Base pillar weights: Emergency (25%), Savings Rate (20%), Diversification (20%), Protection (15%), Goals (20%). Missing data categories are marked Unassessed and their weights are dynamically re-allocated across populated pillars without penalty. Calculations represent educational diagnostics, not regulated credit or insurance underwriting.`;

  return {
    engineVersion: HEALTH_SCORE_ENGINE_VERSION,
    overallScore,
    ratingLabel,
    ratingDescription,
    assessedPillarsCount: assessedPillars.length,
    totalPillarsCount: rawPillars.length,
    coveragePct,
    confidence,
    confidenceNote,
    pillars,
    weakestPillar,
    strongestPillar,
    diagnostics,
    hasHistoricalTimeline: false,
    historicalTrackingDisclosure,
    methodologyDisclosure,
  };
}
