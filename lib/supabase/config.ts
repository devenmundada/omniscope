/**
 * Centralized Supabase configuration resolver and sanitizer.
 * Ensures URLs and API keys copied from Supabase Dashboard are properly formatted
 * and normalized across server and browser runtimes.
 */

export function getSupabaseUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';

  if (!rawUrl) {
    return 'https://placeholder.supabase.co';
  }

  // If a dashboard link was entered (e.g. https://supabase.com/dashboard/project/<ref>/...)
  // normalize it to the official Project API endpoint (https://<ref>.supabase.co)
  if (rawUrl.includes('supabase.com/dashboard/project/')) {
    const match = rawUrl.match(/project\/([a-z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://${match[1]}.supabase.co`;
    }
  }

  // Remove trailing slashes and clean protocol
  let cleaned = rawUrl.replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  return cleaned;
}

export function getSupabaseKey(): string {
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  let cleaned = rawKey.trim();

  // Strip accidental leading equals signs or quotes from copy-paste (e.g. ="sb_... or "=sb_...)
  cleaned = cleaned.replace(/^[=\s"']+/, '');

  // Strip trailing quotes or whitespace
  cleaned = cleaned.replace(/["'\s]+$/, '');

  if (!cleaned) {
    return 'placeholder-anon-key';
  }

  return cleaned;
}

export function isSupabaseConfigured(): boolean {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!rawUrl || !rawKey) return false;

  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  const isPlaceholderUrl = url.includes('placeholder.supabase.co');
  const isPlaceholderKey = key === 'placeholder-anon-key' || key.length < 10;

  return !isPlaceholderUrl && !isPlaceholderKey;
}
