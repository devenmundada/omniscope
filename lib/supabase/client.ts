import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseKey } from './config';

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  client = createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
