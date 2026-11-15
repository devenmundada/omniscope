/**
 * Pure Mathematical Projection & Compounding Engine for OmniScope Goals.
 * Discloses discrete monthly compounding formulas, handles deadlines,
 * overdue goals, zero returns, and deterministic scenario feasibility.
 */

export interface GoalProjectionScenario {
  label: string;
  ratePct: number;
  projectedFutureValue: number;
  description: string;
}

export type ScenarioFeasibility = 'High' | 'Moderate' | 'Low' | 'Achieved' | 'Overdue';
export type DeadlineStatus = 'Active' | 'Due Today' | 'Overdue' | 'Fully Funded';

export interface GoalProjectionDetails {
  targetAmount: number;
  currentAllocatedAmount: number;
  remainingShortfall: number;
  monthlyContribution: number;
  targetYear: number;
  targetDate: string | null;
  deadlineDate: string;
  deadlineInterpretation: string;
  deadlineStatus: DeadlineStatus;
  isDefaultDeadline: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isFunded: boolean;
  daysRemaining: number;
  monthsRemaining: number;
  yearsRemaining: number;
  baselineRatePct: number;
  baselineFutureValue: number;
  requiredMonthlySavings: number;
  monthlySavingsGap: number;
  onTrack: boolean;
  scenarioFeasibility: ScenarioFeasibility;
  feasibilityLabel: string;
  feasibilityExplanation: string;
  fundingPct: number;
  scenarios: {
    conservative: GoalProjectionScenario;
    baseline: GoalProjectionScenario;
    optimistic: GoalProjectionScenario;
    zeroReturn: GoalProjectionScenario;
  };
  inflationAdjustedTarget: number;
  assumedInflationPct: number;
  riskFactors: string[];
  guidance: string;
  methodologyDisclosure: string;
}

/**
 * Resolves the explicit calendar deadline for a goal.
 * - Where targetDate exists, it is used directly.
 * - Where only targetYear exists, the deadline is interpreted as December 31
 *   of that year (23:59:59.999 UTC), representing the end of the target calendar year.
 */
export function resolveGoalDeadline(
  targetYear?: number | null,
  targetDate?: Date | string | null,
  asOfDate: Date = new Date()
): {
  deadline: Date;
  isDateSpecified: boolean;
  isDefaultDeadline: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  daysRemaining: number;
  monthsRemaining: number;
  yearsRemaining: number;
  deadlineInterpretation: string;
} {
  let deadline: Date;
  let isDateSpecified = false;
  let isDefaultDeadline = false;
  let deadlineInterpretation: string;

  if (targetDate) {
    deadline = targetDate instanceof Date ? targetDate : new Date(targetDate);
    if (isNaN(deadline.getTime())) {
      // Invalid date fallback
      isDefaultDeadline = true;
      const year = targetYear && targetYear > 1900 ? targetYear : asOfDate.getUTCFullYear() + 5;
      deadline = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      deadlineInterpretation = `Target date was invalid; defaulted to 5 years (December 31, ${year}) as an editable illustrative assumption.`;
    } else {
      isDateSpecified = true;
      deadlineInterpretation = `Explicit target date: ${deadline.toISOString().split('T')[0]}.`;
    }
  } else if (targetYear && targetYear > 1900) {
    deadline = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));
    deadlineInterpretation = `Year-only target: interpreted as December 31, ${targetYear} at 23:59:59 UTC (end of calendar year).`;
  } else {
    isDefaultDeadline = true;
    const defaultYear = asOfDate.getUTCFullYear() + 5;
    deadline = new Date(Date.UTC(defaultYear, 11, 31, 23, 59, 59, 999));
    deadlineInterpretation = `No target date or year provided; defaulted to 5 years (December 31, ${defaultYear}) as an editable illustrative baseline assumption. You can edit this milestone at any time.`;
  }

  const asOfTime = asOfDate.getTime();
  const deadlineTime = deadline.getTime();
  const diffMs = deadlineTime - asOfTime;

  // Check if same calendar day in UTC
  const isSameUtcDay =
    asOfDate.getUTCFullYear() === deadline.getUTCFullYear() &&
    asOfDate.getUTCMonth() === deadline.getUTCMonth() &&
    asOfDate.getUTCDate() === deadline.getUTCDate();

  if (isSameUtcDay) {
    return {
      deadline,
      isDateSpecified,
      isDefaultDeadline,
      isOverdue: false,
      isDueToday: true,
      daysRemaining: 0,
      monthsRemaining: 0,
      yearsRemaining: 0,
      deadlineInterpretation: `${deadlineInterpretation} (Due today).`,
    };
  }

  if (diffMs < 0) {
    return {
      deadline,
      isDateSpecified,
      isDefaultDeadline,
      isOverdue: true,
      isDueToday: false,
      daysRemaining: 0,
      monthsRemaining: 0,
      yearsRemaining: 0,
      deadlineInterpretation: `${deadlineInterpretation} (Deadline passed).`,
    };
  }

  const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  // Standard average month length: 365.25 / 12 = 30.4375 days
  const monthsRemaining = Math.max(1, Math.round(daysRemaining / 30.4375));
  const yearsRemaining = parseFloat((monthsRemaining / 12).toFixed(2));

  return {
    deadline,
    isDateSpecified,
    isDefaultDeadline,
    isOverdue: false,
    isDueToday: false,
    daysRemaining,
    monthsRemaining,
    yearsRemaining,
    deadlineInterpretation,
  };
}

/**
 * Calculates Future Value (FV) using discrete monthly compounding:
 * FV = P * (1 + r/12)^n + PMT * [ ( (1 + r/12)^n - 1 ) / (r/12) ]
 * When r = 0: FV = P + PMT * n
 * When n <= 0 (overdue / due today): FV = P (no future contributions or growth projected)
 */
export function calculateFutureValue(
  principal: number,
  monthlyContribution: number,
  annualRatePct: number,
  monthsRemaining: number
): number {
  const p = Math.max(0, principal);
  const pmt = Math.max(0, monthlyContribution);
  const n = Math.max(0, monthsRemaining);

  // If time has expired or is zero, return current principal
  if (n <= 0) return Math.round(p);

  const r = annualRatePct / 100;

  // Zero-return edge case
  if (Math.abs(r) < 0.000001) {
    return Math.round(p + pmt * n);
  }

  const monthlyRate = r / 12;
  const growthFactor = Math.pow(1 + monthlyRate, n);
  const futurePrincipal = p * growthFactor;
  const futureAnnuity = pmt * ((growthFactor - 1) / monthlyRate);

  return Math.round(futurePrincipal + futureAnnuity);
}

/**
 * Calculates the required monthly contribution (PMT) to reach targetAmount
 * given initial principal (P), months remaining (n), and annual rate (r).
 * If n <= 0, returns 0 (monthly contributions are no longer applicable; lump-sum needed).
 */
export function calculateRequiredMonthlyContribution(
  targetAmount: number,
  principal: number,
  annualRatePct: number,
  monthsRemaining: number
): number {
  const target = Math.max(0, targetAmount);
  const p = Math.max(0, principal);
  const n = Math.max(0, monthsRemaining);

  if (n <= 0) {
    return 0; // Deadline elapsed or today; ongoing monthly saving cannot bridge the gap
  }

  const r = annualRatePct / 100;

  if (Math.abs(r) < 0.000001) {
    const remainingNeeded = target - p;
    return remainingNeeded <= 0 ? 0 : Math.round(remainingNeeded / n);
  }

  const monthlyRate = r / 12;
  const growthFactor = Math.pow(1 + monthlyRate, n);
  const futurePrincipal = p * growthFactor;

  if (futurePrincipal >= target) {
    return 0; // Existing principal already satisfies target through capital appreciation
  }

  const neededFromContributions = target - futurePrincipal;
  const annuityFactor = (growthFactor - 1) / monthlyRate;
  const requiredPmt = neededFromContributions / annuityFactor;

  return Math.max(0, Math.round(requiredPmt));
}

/**
 * Computes deep projections, deterministic scenario feasibility, and diagnostics for a goal.
 */
export function computeGoalProjectionDetails(
  goal: {
    name: string;
    targetAmount: number | string;
    currentAllocatedAmount?: number | string | null;
    monthlyContribution?: number | string | null;
    targetYear?: number | null;
    targetDate?: Date | string | null;
    metadata?: {
      assumedCagrPct?: number;
      assumedInflationPct?: number;
      targetAge?: number;
    } | null;
  },
  asOfDate: Date = new Date()
): GoalProjectionDetails {
  const targetAmount = typeof goal.targetAmount === 'number'
    ? goal.targetAmount
    : parseFloat(goal.targetAmount || '0');

  const currentAllocatedAmount = typeof goal.currentAllocatedAmount === 'number'
    ? goal.currentAllocatedAmount
    : parseFloat(goal.currentAllocatedAmount || '0');

  const monthlyContribution = typeof goal.monthlyContribution === 'number'
    ? goal.monthlyContribution
    : parseFloat(goal.monthlyContribution || '0');

  const metadata = (goal.metadata || {}) as {
    assumedCagrPct?: number;
    assumedInflationPct?: number;
    targetAge?: number;
  };

  const baselineRatePct = typeof metadata.assumedCagrPct === 'number' && metadata.assumedCagrPct > 0
    ? metadata.assumedCagrPct
    : 10.0;
  const assumedInflationPct = typeof metadata.assumedInflationPct === 'number' && metadata.assumedInflationPct >= 0
    ? metadata.assumedInflationPct
    : 6.0;

  const conservativeRatePct = Math.max(4.0, baselineRatePct - 4.0); // e.g. 6%
  const optimisticRatePct = baselineRatePct + 2.0; // e.g. 12%

  // Resolve deadline with explicit documentation
  const deadlineInfo = resolveGoalDeadline(goal.targetYear, goal.targetDate, asOfDate);
  const {
    deadline,
    isDefaultDeadline,
    isOverdue,
    isDueToday,
    daysRemaining,
    monthsRemaining,
    yearsRemaining,
    deadlineInterpretation,
  } = deadlineInfo;

  const targetYear = goal.targetYear || deadline.getUTCFullYear();
  const targetDateStr = goal.targetDate
    ? (goal.targetDate instanceof Date ? goal.targetDate.toISOString() : String(goal.targetDate))
    : null;
  const deadlineDateStr = deadline.toISOString().split('T')[0];

  const remainingShortfall = Math.max(0, targetAmount - currentAllocatedAmount);
  const isFunded = targetAmount > 0 && currentAllocatedAmount >= targetAmount;

  // Determine deadline status
  let deadlineStatus: DeadlineStatus = 'Active';
  if (isFunded) {
    deadlineStatus = 'Fully Funded';
  } else if (isOverdue) {
    deadlineStatus = 'Overdue';
  } else if (isDueToday) {
    deadlineStatus = 'Due Today';
  }

  // Calculate scenario future values
  // If overdue or due today: do NOT project future contributions or compounding growth!
  let zeroReturnFV: number;
  let conservativeFV: number;
  let baselineFV: number;
  let optimisticFV: number;
  let requiredMonthlySavings = 0;
  let monthlySavingsGap = 0;
  let onTrack = false;
  let scenarioFeasibility: ScenarioFeasibility = 'Moderate';
  let feasibilityLabel = 'Evaluating';
  let feasibilityExplanation = '';

  if (isOverdue || isDueToday) {
    // No future compounding beyond deadline
    zeroReturnFV = Math.round(currentAllocatedAmount);
    conservativeFV = Math.round(currentAllocatedAmount);
    baselineFV = Math.round(currentAllocatedAmount);
    optimisticFV = Math.round(currentAllocatedAmount);
    requiredMonthlySavings = 0;
    monthlySavingsGap = 0;

    if (isFunded) {
      onTrack = true;
      scenarioFeasibility = 'Achieved';
      feasibilityLabel = 'Target Achieved';
      feasibilityExplanation = 'Current allocated capital covers 100% of the target amount.';
    } else {
      onTrack = false;
      scenarioFeasibility = 'Overdue';
      feasibilityLabel = isOverdue ? 'Overdue Shortfall' : 'Due Today Shortfall';
      feasibilityExplanation = `Deadline has arrived with an unfunded shortfall of ₹${remainingShortfall.toLocaleString('en-IN')}. Monthly saving is no longer applicable; lump-sum funding is required.`;
    }
  } else {
    // Active future goal
    zeroReturnFV = calculateFutureValue(currentAllocatedAmount, monthlyContribution, 0, monthsRemaining);
    conservativeFV = calculateFutureValue(currentAllocatedAmount, monthlyContribution, conservativeRatePct, monthsRemaining);
    baselineFV = calculateFutureValue(currentAllocatedAmount, monthlyContribution, baselineRatePct, monthsRemaining);
    optimisticFV = calculateFutureValue(currentAllocatedAmount, monthlyContribution, optimisticRatePct, monthsRemaining);

    requiredMonthlySavings = calculateRequiredMonthlyContribution(
      targetAmount,
      currentAllocatedAmount,
      baselineRatePct,
      monthsRemaining
    );

    monthlySavingsGap = Math.max(0, requiredMonthlySavings - monthlyContribution);
    onTrack = baselineFV >= targetAmount * 0.95;

    // Honest deterministic scenario feasibility (NOT a statistical Monte Carlo probability)
    if (isFunded) {
      scenarioFeasibility = 'Achieved';
      feasibilityLabel = 'Fully Funded Today';
      feasibilityExplanation = 'Current allocated corpus already meets or exceeds target amount before future compounding.';
    } else if (conservativeFV >= targetAmount) {
      scenarioFeasibility = 'High';
      feasibilityLabel = 'High Feasibility (Conservative & Baseline)';
      feasibilityExplanation = `Planned SIP of ₹${monthlyContribution.toLocaleString('en-IN')}/mo satisfies target under both Conservative (${conservativeRatePct}%) and Baseline (${baselineRatePct}%) compounding models.`;
    } else if (baselineFV >= targetAmount) {
      scenarioFeasibility = 'Moderate';
      feasibilityLabel = 'Feasible at Baseline (10%)';
      feasibilityExplanation = `Target is met under Baseline (${baselineRatePct}%) compounding, but falls short under Conservative (${conservativeRatePct}%) returns.`;
    } else if (baselineFV >= targetAmount * 0.8) {
      scenarioFeasibility = 'Moderate';
      feasibilityLabel = 'Moderate Gap (< 20% Shortfall)';
      feasibilityExplanation = `Baseline projection reaches ${( (baselineFV / targetAmount) * 100 ).toFixed(0)}% of target. An additional ₹${monthlySavingsGap.toLocaleString('en-IN')}/mo closes the gap.`;
    } else {
      scenarioFeasibility = 'Low';
      feasibilityLabel = 'Significant Shortfall';
      feasibilityExplanation = `Current monthly SIP leaves a substantial projected gap at year ${targetYear}. An additional ₹${monthlySavingsGap.toLocaleString('en-IN')}/mo is needed under Baseline returns.`;
    }
  }

  const fundingPct = targetAmount > 0
    ? Math.min(100, Math.round((currentAllocatedAmount / targetAmount) * 100))
    : 0;

  // Inflation-adjusted target
  const inflationGrowth = Math.pow(1 + assumedInflationPct / 100, Math.max(0, yearsRemaining));
  const inflationAdjustedTarget = Math.round(targetAmount * inflationGrowth);

  // Dynamic risk factor identification
  const riskFactors: string[] = [];
  if (isOverdue && !isFunded) {
    riskFactors.push(`Deadline passed: Goal milestone elapsed with ₹${remainingShortfall.toLocaleString('en-IN')} remaining unfunded.`);
  } else if (isDueToday && !isFunded) {
    riskFactors.push(`Due today: Goal milestone date reached with an unfunded gap of ₹${remainingShortfall.toLocaleString('en-IN')}.`);
  } else {
    if (yearsRemaining > 0 && yearsRemaining <= 3 && currentAllocatedAmount > 0) {
      riskFactors.push('Short time horizon (< 3 years): Elevated equity exposure risks capital loss if market draws down before target date.');
    }
    if (monthlyContribution <= 0 && !isFunded) {
      riskFactors.push('Zero monthly contribution: Goal reliance is entirely on existing corpus compounding.');
    }
    if (monthlySavingsGap > 0) {
      riskFactors.push(`Monthly contribution gap: Current SIP is ₹${monthlySavingsGap.toLocaleString('en-IN')} below the ₹${requiredMonthlySavings.toLocaleString('en-IN')} needed for on-time funding.`);
    }
    if (assumedInflationPct >= 6 && yearsRemaining >= 8) {
      riskFactors.push(`Long-term inflation: Over ${yearsRemaining} years at ${assumedInflationPct}% inflation, equivalent purchasing power may require ₹${(inflationAdjustedTarget / 100000).toFixed(1)}L.`);
    }
    if (riskFactors.length === 0) {
      riskFactors.push('Discipline risk: Pausing SIPs during market drawdowns.');
      riskFactors.push('Unplanned lifestyle drawdowns.');
    }
  }

  // Deterministic guidance (labeled as Guidance / Suggested Next Steps, NOT AI recommendation)
  let guidance = '';
  if (isFunded) {
    guidance = `Target achieved: Current corpus of ₹${(currentAllocatedAmount / 100000).toFixed(1)}L covers the ₹${(targetAmount / 100000).toFixed(1)}L target. Consider shifting the allocated funds into capital-preservation assets (liquid or short-duration debt) to safeguard the principal.`;
  } else if (isOverdue) {
    guidance = `Deadline passed: Target milestone was reached with an unfunded balance of ₹${remainingShortfall.toLocaleString('en-IN')}. Suggested next step: allocate an immediate lump-sum from liquid surplus or update the goal's target date to establish a realistic future funding schedule.`;
  } else if (isDueToday) {
    guidance = `Due today: Milestone date reached with a remaining shortfall of ₹${remainingShortfall.toLocaleString('en-IN')}. Review available liquid reserves to bridge the balance.`;
  } else if (onTrack && monthlyContribution >= requiredMonthlySavings) {
    guidance = `On track: Planned monthly SIP of ₹${monthlyContribution.toLocaleString('en-IN')} meets the ₹${requiredMonthlySavings.toLocaleString('en-IN')} benchmark under baseline compounding (${baselineRatePct}%). As target year ${targetYear} nears, consider gradually moving accumulated equity into lower-volatility fixed-income instruments.`;
  } else if (monthlySavingsGap > 0) {
    guidance = `Shortfall detected: To achieve ₹${(targetAmount / 100000).toFixed(1)}L by ${targetYear} under baseline growth (${baselineRatePct}%), increase monthly contribution by ₹${monthlySavingsGap.toLocaleString('en-IN')} (to ₹${requiredMonthlySavings.toLocaleString('en-IN')}/mo), or extend your target deadline by 1-2 years.`;
  } else {
    guidance = `Maintain regular monthly contributions to keep pace with your ${targetYear} target date. Review milestone assumptions annually.`;
  }

  const methodologyDisclosure = `Compounding calculations use discrete monthly compounding: FV = P*(1+r/12)^n + PMT*[((1+r/12)^n - 1)/(r/12)], where n is exact months to deadline. Deadline: ${deadlineDateStr} (${deadlineInterpretation}). Return models: Conservative (${conservativeRatePct}%), Baseline (${baselineRatePct}%), Optimistic (${optimisticRatePct}%). Projections and feasibility statuses are deterministic mathematical illustrations, not statistical probabilities or guaranteed market returns.`;

  return {
    targetAmount,
    currentAllocatedAmount,
    remainingShortfall,
    monthlyContribution,
    targetYear,
    targetDate: targetDateStr,
    deadlineDate: deadlineDateStr,
    deadlineInterpretation,
    deadlineStatus,
    isDefaultDeadline,
    isOverdue,
    isDueToday,
    isFunded,
    daysRemaining,
    monthsRemaining,
    yearsRemaining,
    baselineRatePct,
    baselineFutureValue: baselineFV,
    requiredMonthlySavings,
    monthlySavingsGap,
    onTrack,
    scenarioFeasibility,
    feasibilityLabel,
    feasibilityExplanation,
    fundingPct,
    scenarios: {
      conservative: {
        label: 'Conservative',
        ratePct: conservativeRatePct,
        projectedFutureValue: conservativeFV,
        description: 'Capital preservation & fixed-income (FD/Debt) oriented',
      },
      baseline: {
        label: 'Baseline',
        ratePct: baselineRatePct,
        projectedFutureValue: baselineFV,
        description: 'Balanced multi-asset growth allocation',
      },
      optimistic: {
        label: 'Optimistic',
        ratePct: optimisticRatePct,
        projectedFutureValue: optimisticFV,
        description: 'Equity-oriented compounding trajectory',
      },
      zeroReturn: {
        label: 'Zero Return',
        ratePct: 0,
        projectedFutureValue: zeroReturnFV,
        description: 'Pure cash contributions with zero market appreciation',
      },
    },
    inflationAdjustedTarget,
    assumedInflationPct,
    riskFactors,
    guidance,
    methodologyDisclosure,
  };
}
