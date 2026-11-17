'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deleteUserAccount } from '@/lib/db/account-data';
import { logger } from '@/lib/logger';

/** Permanently deletes the signed-in user's account and all their data, after typed confirmation. */
export async function deleteAccountAction(_prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  if (String(form.get('confirm') ?? '').trim() !== 'DELETE') return { error: 'Type DELETE in capitals to confirm.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has ended. Sign in again to delete your account.' };
  try {
    const deleted = await deleteUserAccount(user.id);
    if (!deleted) return { error: 'The account could not be found.' };
  } catch (err) {
    logger.error('Account deletion failed:', err instanceof Error ? err.message : String(err));
    return { error: 'Deletion failed. Nothing was removed; please try again.' };
  }
  await supabase.auth.signOut().catch(() => undefined);
  redirect('/welcome?deleted=1');
}
