import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabaseKey } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // Ignored if middleware refreshes user sessions.
        }
      },
    },
  });
}
