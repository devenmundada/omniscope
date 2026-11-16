'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { getMarketIntelligence } from '@/lib/ai/market-intel';

/** Regenerates today's market intelligence for the signed-in user, bypassing the cache. */
export async function refreshMarketIntelAction(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in first.' };
  try {
    const snapshot = await loadFinancialSnapshot(user.id);
    await getMarketIntelligence(user.id, snapshot, { force: true });
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Refresh failed.' };
  }
}
