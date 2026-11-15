import 'server-only';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from './index';
import { goals } from './schema/goals';
import type { GoalEntity, NewGoalEntity } from './schema/goals';
import {
  calculateFutureValue,
  calculateRequiredMonthlyContribution,
  computeGoalProjectionDetails,
  resolveGoalDeadline,
  type GoalProjectionScenario,
  type GoalProjectionDetails,
  type ScenarioFeasibility,
  type DeadlineStatus,
} from '@/lib/math/financial-projections';

export {
  calculateFutureValue,
  calculateRequiredMonthlyContribution,
  resolveGoalDeadline,
  type GoalProjectionScenario,
  type GoalProjectionDetails,
  type ScenarioFeasibility,
  type DeadlineStatus,
};

export interface CreateGoalInput {
  name: string;
  icon?: string;
  targetAmount: number;
  currentAllocatedAmount?: number;
  monthlyContribution?: number;
  targetYear?: number;
  targetDate?: Date | string | null;
  priority?: number;
  category?: string;
  notes?: string;
  assumedCagrPct?: number;
  assumedInflationPct?: number;
}

export interface UpdateGoalInput {
  name?: string;
  icon?: string;
  targetAmount?: number;
  currentAllocatedAmount?: number;
  monthlyContribution?: number;
  targetYear?: number;
  targetDate?: Date | string | null;
  priority?: number;
  category?: string;
  notes?: string;
  assumedCagrPct?: number;
  assumedInflationPct?: number;
}

/**
 * Computes deep projections for a goal entity using the shared mathematical engine.
 */
export function computeGoalProjection(
  goal: GoalEntity,
  asOfDateOrYear: Date | number = new Date()
): GoalProjectionDetails {
  const asOfDate = typeof asOfDateOrYear === 'number'
    ? new Date(Date.UTC(asOfDateOrYear, 0, 1))
    : asOfDateOrYear;

  return computeGoalProjectionDetails(
    {
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAllocatedAmount: goal.currentAllocatedAmount,
      monthlyContribution: goal.monthlyContribution,
      targetYear: goal.targetYear,
      targetDate: goal.targetDate,
      metadata: goal.metadata as { assumedCagrPct?: number; assumedInflationPct?: number; targetAge?: number } | null,
    },
    asOfDate
  );
}

/**
 * Retrieves all goals for a verified user, strictly scoped by `goals.userId = userId`.
 */
export async function getUserGoals(userId: string): Promise<GoalEntity[]> {
  return await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(asc(goals.priority), asc(goals.targetYear), desc(goals.createdAt));
}

/**
 * Retrieves a single goal by ID, strictly verifying ownership.
 */
export async function getGoalById(userId: string, goalId: string): Promise<GoalEntity | null> {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);

  return goal || null;
}

/**
 * Creates a new goal record strictly assigned to the verified user.
 */
export async function createGoal(
  userId: string,
  input: CreateGoalInput
): Promise<GoalEntity> {
  const targetAmount = Math.max(0, input.targetAmount);
  const currentAllocatedAmount = Math.max(0, input.currentAllocatedAmount ?? 0);
  const monthlyContribution = Math.max(0, input.monthlyContribution ?? 0);
  const currentYear = new Date().getFullYear();

  let targetYear = input.targetYear ?? currentYear + 5;
  let targetDate: Date | null = null;

  if (input.targetDate) {
    targetDate = input.targetDate instanceof Date ? input.targetDate : new Date(input.targetDate);
    if (!isNaN(targetDate.getTime())) {
      targetYear = targetDate.getUTCFullYear();
    } else {
      targetDate = null;
    }
  }

  const validIcons = ['home', 'graduation', 'palm', 'car', 'shield'];
  const icon = validIcons.includes(input.icon || '') ? input.icon! : 'shield';

  const [newGoal] = await db
    .insert(goals)
    .values({
      userId,
      name: input.name.trim() || 'Financial Goal',
      icon,
      targetAmount: targetAmount.toFixed(2),
      currentAllocatedAmount: currentAllocatedAmount.toFixed(2),
      monthlyContribution: monthlyContribution.toFixed(2),
      targetYear,
      targetDate,
      priority: Math.max(1, input.priority ?? 1),
      category: input.category || 'OTHER',
      notes: input.notes ? input.notes.trim() : null,
      metadata: {
        assumedCagrPct: input.assumedCagrPct ?? 10.0,
        assumedInflationPct: input.assumedInflationPct ?? 6.0,
      },
    })
    .returning();

  return newGoal;
}

/**
 * Updates an existing goal record, strictly scoped to the verified user ID.
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  input: UpdateGoalInput
): Promise<GoalEntity | null> {
  const updateValues: Partial<NewGoalEntity> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name.trim();
  if (input.icon !== undefined) {
    const validIcons = ['home', 'graduation', 'palm', 'car', 'shield'];
    updateValues.icon = validIcons.includes(input.icon) ? input.icon : 'shield';
  }
  if (input.targetAmount !== undefined) {
    updateValues.targetAmount = Math.max(0, input.targetAmount).toFixed(2);
  }
  if (input.currentAllocatedAmount !== undefined) {
    updateValues.currentAllocatedAmount = Math.max(0, input.currentAllocatedAmount).toFixed(2);
  }
  if (input.monthlyContribution !== undefined) {
    updateValues.monthlyContribution = Math.max(0, input.monthlyContribution).toFixed(2);
  }
  if (input.targetYear !== undefined) {
    updateValues.targetYear = input.targetYear;
  }
  if (input.targetDate !== undefined) {
    if (input.targetDate === null) {
      updateValues.targetDate = null;
    } else {
      const parsed = input.targetDate instanceof Date ? input.targetDate : new Date(input.targetDate);
      updateValues.targetDate = !isNaN(parsed.getTime()) ? parsed : null;
      if (updateValues.targetDate) {
        updateValues.targetYear = updateValues.targetDate.getUTCFullYear();
      }
    }
  }
  if (input.priority !== undefined) {
    updateValues.priority = Math.max(1, input.priority);
  }
  if (input.category !== undefined) {
    updateValues.category = input.category;
  }
  if (input.notes !== undefined) {
    updateValues.notes = input.notes ? input.notes.trim() : null;
  }

  if (input.assumedCagrPct !== undefined || input.assumedInflationPct !== undefined) {
    const [existing] = await db
      .select({ metadata: goals.metadata })
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .limit(1);

    const existingMeta = (existing?.metadata || {}) as Record<string, unknown>;
    updateValues.metadata = {
      ...existingMeta,
      ...(input.assumedCagrPct !== undefined ? { assumedCagrPct: input.assumedCagrPct } : {}),
      ...(input.assumedInflationPct !== undefined ? { assumedInflationPct: input.assumedInflationPct } : {}),
    };
  }

  const [updated] = await db
    .update(goals)
    .set(updateValues)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();

  return updated || null;
}

/**
 * Deletes a goal record, strictly scoped to the verified user ID.
 */
export async function deleteGoal(userId: string, goalId: string): Promise<boolean> {
  const result = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning({ id: goals.id });

  return result.length > 0;
}
