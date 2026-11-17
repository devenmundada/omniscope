import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { exportUserData } from '@/lib/db/account-data';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Downloads everything OmniScope stores about the signed-in user as one JSON file. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to export your data.' }, { status: 401 });
  try {
    const data = await exportUserData(user.id);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="omniscope-data-${day}.json"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error('Export failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Export failed. Please try again.' }, { status: 500 });
  }
}
