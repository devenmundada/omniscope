'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { createGoal, updateGoal, deleteGoal } from '@/lib/db/goals';
import type { GoalEntity } from '@/lib/db/schema/goals';

export interface GoalActionResult {
  success?: boolean;
  error?: string;
  goal?: GoalEntity;
}

/**
 * Server action to save (create or update) a user's financial goal.
 * Strictly verifies authenticated user session and ownership.
 */
export async function saveGoalAction(formData: FormData): Promise<GoalActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to manage goals.' };
    }

    const id = formData.get('id') as string | null;
    const name = (formData.get('name') as string || '').trim();
    const icon = (formData.get('icon') as string || 'shield').trim();
    const targetAmountRaw = formData.get('targetAmount') as string;
    const currentAllocatedRaw = formData.get('currentAllocatedAmount') as string;
    const monthlyContributionRaw = formData.get('monthlyContribution') as string;
    const targetYearRaw = formData.get('targetYear') as string;
    const targetDateRaw = formData.get('targetDate') as string | null;
    const category = (formData.get('category') as string || 'OTHER').trim();
    const notes = (formData.get('notes') as string || '').trim();
    const assumedCagrRaw = formData.get('assumedCagrPct') as string;
    const assumedInflationRaw = formData.get('assumedInflationPct') as string;

    if (!name) {
      return { error: 'Goal name is required.' };
    }

    const targetAmount = parseFloat(targetAmountRaw);
    if (isNaN(targetAmount) || targetAmount <= 0) {
      return { error: 'Target amount must be a positive number.' };
    }

    const currentAllocatedAmount = currentAllocatedRaw ? parseFloat(currentAllocatedRaw) : 0;
    if (isNaN(currentAllocatedAmount) || currentAllocatedAmount < 0) {
      return { error: 'Current allocated amount cannot be negative.' };
    }

    const monthlyContribution = monthlyContributionRaw ? parseFloat(monthlyContributionRaw) : 0;
    if (isNaN(monthlyContribution) || monthlyContribution < 0) {
      return { error: 'Monthly contribution cannot be negative.' };
    }

    const currentYear = new Date().getFullYear();
    let targetYear = targetYearRaw ? parseInt(targetYearRaw, 10) : currentYear + 5;
    let targetDate: Date | null = null;

    if (targetDateRaw && targetDateRaw.trim().length > 0) {
      const parsedDate = new Date(targetDateRaw.trim());
      if (!isNaN(parsedDate.getTime())) {
        targetDate = parsedDate;
        targetYear = parsedDate.getUTCFullYear();
      }
    }

    if (isNaN(targetYear) || targetYear < 1990 || targetYear > currentYear + 100) {
      return { error: 'Please specify a valid calendar target year.' };
    }

    const assumedCagrPct = assumedCagrRaw ? parseFloat(assumedCagrRaw) : 10.0;
    const assumedInflationPct = assumedInflationRaw ? parseFloat(assumedInflationRaw) : 6.0;

    let savedGoal: GoalEntity;

    if (id && id.trim().length > 0) {
      const updated = await updateGoal(authUser.id, id.trim(), {
        name,
        icon,
        targetAmount,
        currentAllocatedAmount,
        monthlyContribution,
        targetYear,
        targetDate,
        category,
        notes: notes || undefined,
        assumedCagrPct,
        assumedInflationPct,
      });

      if (!updated) {
        return { error: 'Goal not found or you do not have permission to edit it.' };
      }
      savedGoal = updated;
    } else {
      savedGoal = await createGoal(authUser.id, {
        name,
        icon,
        targetAmount,
        currentAllocatedAmount,
        monthlyContribution,
        targetYear,
        targetDate,
        category,
        notes: notes || undefined,
        assumedCagrPct,
        assumedInflationPct,
      });
    }

    revalidatePath('/goals');
    revalidatePath('/health');
    revalidatePath('/');

    return { success: true, goal: savedGoal };
  } catch (err) {
    console.error('Error saving goal:', err);
    return { error: err instanceof Error ? err.message : 'Failed to save goal.' };
  }
}

/**
 * Server action to delete a user's financial goal.
 * Strictly verifies authenticated user session and ownership.
 */
export async function deleteGoalAction(goalId: string): Promise<{ success?: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to delete goals.' };
    }

    if (!goalId) {
      return { error: 'Goal ID is required.' };
    }

    const deleted = await deleteGoal(authUser.id, goalId);
    if (!deleted) {
      return { error: 'Goal not found or already deleted.' };
    }

    revalidatePath('/goals');
    revalidatePath('/health');
    revalidatePath('/');

    return { success: true };
  } catch (err) {
    console.error('Error deleting goal:', err);
    return { error: err instanceof Error ? err.message : 'Failed to delete goal.' };
  }
}
