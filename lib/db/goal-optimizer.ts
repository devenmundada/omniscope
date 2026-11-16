import 'server-only';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { getRiskReport, type RiskReport } from './risk';
import type { GoalInput } from '@/lib/math/goal-optimizer';

export interface GoalOptimizerGoal extends GoalInput {
  category: string;
  deadline: string;
}

export interface GoalOptimizerData {
  goals: GoalOptimizerGoal[];
  fundedGoals: string[];
  assets: Array<{ symbol: string; name: string; value: number; weight: number }>;
  optimizer: RiskReport['optimizer'];
  riskFree: number;
}

/** Seed used for goal i on the Goals page, so probabilities here match it exactly. */
export const goalSeed = (index: number) => 20261115 + index;

export async function getGoalOptimizerData(userId: string): Promise<GoalOptimizerData | null> {
  const [snapshot, risk] = await Promise.all([loadFinancialSnapshot(userId), getRiskReport(userId)]);
  if (!risk) return null;
  const projections = snapshot.summary.goalsSummary.projections;
  const goals: GoalOptimizerGoal[] = [];
  const fundedGoals: string[] = [];
  projections.forEach((p, i) => {
    const d = p.details;
    if (d.isFunded || d.isOverdue || d.monthsRemaining <= 0) {
      fundedGoals.push(p.goal.name);
      return;
    }
    goals.push({
      id: p.goal.id,
      name: p.goal.name,
      category: String(p.goal.category),
      deadline: String(d.deadlineDate),
      corpus: d.currentAllocatedAmount,
      monthly: d.monthlyContribution,
      months: d.monthsRemaining,
      target: d.targetAmount,
      seed: goalSeed(i),
    });
  });
  return {
    goals,
    fundedGoals,
    assets: risk.assets.map((a) => ({ symbol: a.symbol, name: a.name, value: a.value, weight: a.weight })),
    optimizer: risk.optimizer,
    riskFree: risk.riskFree,
  };
}
