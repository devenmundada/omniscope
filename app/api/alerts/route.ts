import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getAlerts } from '@/lib/db/alerts';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to see alerts.' }, { status: 401 });
  try {
    const result = await getAlerts(user.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    logger.error('Alerts failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not compute alerts.' }, { status: 500 });
  }
}
