import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { users, financialProfiles } from './schema';
import type { FinancialProfile, User } from './schema';

export interface UserFullProfile {
  user: User;
  financialProfile: FinancialProfile | null;
}

export interface UpdateProfileInput {
  name?: string;
  displayName?: string;
  investorArchetype?: string;
  riskStyle?: string;
  decisionStyle?: string;
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  emergencyFundTargetMonths?: number;
  emergencyFundActual?: number | null;
  termInsuranceCover?: number | null;
  healthInsuranceCover?: number | null;
  riskToleranceScore?: number;
  hideBalances?: boolean;
}

/**
 * Retrieves the full profile for a verified user ID.
 * If a financial profile record does not yet exist, creates a default one.
 */
export async function getProfileForUser(userId: string): Promise<UserFullProfile | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return null;
  }

  let [profile] = await db
    .select()
    .from(financialProfiles)
    .where(eq(financialProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    // Provision initial profile record if missing
    const [newProfile] = await db
      .insert(financialProfiles)
      .values({
        userId,
        displayName: user.name || user.email.split('@')[0],
        investorArchetype: 'The Patient Compounder',
        riskStyle: 'Measured & Calculated',
        decisionStyle: 'Data-Informed',
        emergencyFundTargetMonths: 6,
        riskToleranceScore: 70,
        preferences: {},
      })
      .returning();
    profile = newProfile;
  }

  return {
    user,
    financialProfile: profile,
  };
}

/**
 * Updates the user's personal and financial profile.
 * Scoped strictly to the authenticated user ID.
 */
export async function updateProfileForUser(
  userId: string,
  input: UpdateProfileInput
): Promise<UserFullProfile> {
  // Update user name if provided
  if (input.name !== undefined) {
    await db
      .update(users)
      .set({
        name: input.name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // Get current preferences to merge
  const [existingProfile] = await db
    .select()
    .from(financialProfiles)
    .where(eq(financialProfiles.userId, userId))
    .limit(1);

  const currentPrefs = (existingProfile?.preferences || {}) as Record<string, unknown>;
  const updatedPrefs = {
    ...currentPrefs,
    ...(input.hideBalances !== undefined ? { hideBalances: input.hideBalances } : {}),
  };

  const profileValues = {
    displayName: input.displayName?.trim() || input.name?.trim() || undefined,
    investorArchetype: input.investorArchetype || 'The Patient Compounder',
    riskStyle: input.riskStyle || 'Measured & Calculated',
    decisionStyle: input.decisionStyle || 'Data-Informed',
    monthlyIncome: input.monthlyIncome != null ? input.monthlyIncome.toFixed(2) : null,
    monthlyExpenses: input.monthlyExpenses != null ? input.monthlyExpenses.toFixed(2) : null,
    emergencyFundTargetMonths: input.emergencyFundTargetMonths ?? 6,
    emergencyFundActual: input.emergencyFundActual != null ? input.emergencyFundActual.toFixed(2) : null,
    termInsuranceCover: input.termInsuranceCover != null ? input.termInsuranceCover.toFixed(2) : null,
    healthInsuranceCover: input.healthInsuranceCover != null ? input.healthInsuranceCover.toFixed(2) : null,
    riskToleranceScore: input.riskToleranceScore ?? 70,
    preferences: updatedPrefs,
    updatedAt: new Date(),
  };

  if (existingProfile) {
    await db
      .update(financialProfiles)
      .set(profileValues)
      .where(eq(financialProfiles.userId, userId));
  } else {
    await db.insert(financialProfiles).values({
      userId,
      ...profileValues,
    });
  }

  const updated = await getProfileForUser(userId);
  if (!updated) {
    throw new Error('Failed to retrieve updated profile');
  }

  return updated;
}
