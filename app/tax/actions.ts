'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { setHoldingPurchaseDate, todayInIndia } from '@/lib/db/tax';

const input = z.object({
  holdingId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date'),
});

/** Saves a holding's purchase date (used for holding period, XIRR and the Journey timeline). */
export async function setPurchaseDateAction(holdingId: string, date: string): Promise<{ success?: boolean; error?: string }> {
  const parsed = input.safeParse({ holdingId, date });
  if (!parsed.success) return { error: 'Please choose a valid date.' };
  if (date > todayInIndia()) return { error: 'The purchase date cannot be in the future.' };
  if (date < '1990-01-01') return { error: 'Please choose a date after 1990.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in again.' };

  const ok = await setHoldingPurchaseDate(user.id, holdingId, date).catch(() => false);
  if (!ok) return { error: 'Could not save that date. Please try again.' };
  for (const path of ['/tax', '/', '/portfolio', '/journey', '/risk']) revalidatePath(path);
  return { success: true };
}
