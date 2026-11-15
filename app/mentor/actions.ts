'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deleteConversation } from '@/lib/db/conversations';

export async function deleteConversationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/mentor');
  const id = String(formData.get('id') || '');
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await deleteConversation(user.id, id);
  }
  revalidatePath('/mentor');
  redirect('/mentor');
}
