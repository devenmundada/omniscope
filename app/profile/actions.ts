'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getProfileForUser, updateProfileForUser, type UserFullProfile } from '@/lib/db/profile';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Full name must have at least 2 characters').max(100),
  displayName: z.string().max(100).optional(),
  investorArchetype: z.string().max(100).optional(),
  riskStyle: z.string().max(100).optional(),
  decisionStyle: z.string().max(100).optional(),
  monthlyIncome: z.number().nonnegative('Monthly income must be positive or zero').nullable().optional(),
  monthlyExpenses: z.number().nonnegative('Monthly expenses must be positive or zero').nullable().optional(),
  emergencyFundTargetMonths: z.number().int().min(1).max(36).optional(),
  emergencyFundActual: z.number().nonnegative().nullable().optional(),
  termInsuranceCover: z.number().nonnegative().nullable().optional(),
  healthInsuranceCover: z.number().nonnegative().nullable().optional(),
  riskToleranceScore: z.number().int().min(0).max(100).optional(),
  hideBalances: z.boolean().optional(),
});

export interface ProfileActionResult {
  success?: boolean;
  error?: string;
  data?: UserFullProfile;
}

/**
 * Server action to fetch the authenticated user's profile.
 */
export async function getProfileAction(): Promise<ProfileActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to view your profile.' };
    }

    const profile = await getProfileForUser(authUser.id);
    if (!profile) {
      return { error: 'Profile not found.' };
    }

    return { success: true, data: profile };
  } catch (err) {
    console.error('Error fetching profile:', err);
    return { error: 'An unexpected error occurred while fetching your profile.' };
  }
}

/**
 * Server action to update the user's profile with strict server-side validation.
 */
export async function updateProfileAction(
  _prevState: ProfileActionResult | null,
  formData: FormData
): Promise<ProfileActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to update your profile.' };
    }

    const parseNumber = (val: FormDataEntryValue | null): number | null | undefined => {
      if (val === null || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    const rawData = {
      name: (formData.get('name') as string)?.trim(),
      displayName: (formData.get('displayName') as string)?.trim() || undefined,
      investorArchetype: (formData.get('investorArchetype') as string)?.trim() || undefined,
      riskStyle: (formData.get('riskStyle') as string)?.trim() || undefined,
      decisionStyle: (formData.get('decisionStyle') as string)?.trim() || undefined,
      monthlyIncome: parseNumber(formData.get('monthlyIncome')),
      monthlyExpenses: parseNumber(formData.get('monthlyExpenses')),
      emergencyFundTargetMonths: Number(formData.get('emergencyFundTargetMonths')) || 6,
      emergencyFundActual: parseNumber(formData.get('emergencyFundActual')),
      termInsuranceCover: parseNumber(formData.get('termInsuranceCover')),
      healthInsuranceCover: parseNumber(formData.get('healthInsuranceCover')),
      riskToleranceScore: Number(formData.get('riskToleranceScore')) || 70,
      hideBalances: formData.get('hideBalances') === 'true',
    };

    const validated = updateProfileSchema.safeParse(rawData);
    if (!validated.success) {
      const firstError = validated.error.issues[0]?.message || 'Validation error.';
      return { error: firstError };
    }

    // Persist to database strictly for authUser.id
    const updated = await updateProfileForUser(authUser.id, validated.data);

    revalidatePath('/profile');
    revalidatePath('/portfolio');
    revalidatePath('/dna');
    revalidatePath('/health');
    revalidatePath('/');

    return { success: true, data: updated };
  } catch (err) {
    console.error('Error updating profile:', err);
    return { error: err instanceof Error ? err.message : 'Failed to update profile.' };
  }
}
