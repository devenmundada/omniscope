import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Minimal Health & Readiness Diagnostic Endpoint.
 * Strictly sanitized: NEVER exposes environment variables, database hosts,
 * connection strings, auth tokens, personal data, or internal error stack traces.
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: 'connected' | 'unavailable' = 'unavailable';
  let overallHealthy = true;

  // 1. Check Database Connectivity with bounded timeout (3000ms)
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database ping timeout')), 3000)
    );

    const queryPromise = (async () => {
      const result = await db.execute(sql`SELECT 1 as alive`);
      return result;
    })();

    await Promise.race([queryPromise, timeoutPromise]);
    dbStatus = 'connected';
  } catch (err) {
    overallHealthy = false;
    dbStatus = 'unavailable';
    logger.error('Health check database probe failed:', err instanceof Error ? err.message : 'Unknown error');
  }

  // 2. Check Supabase Auth configuration status
  const authConfigured = isSupabaseConfigured();
  if (!authConfigured) {
    overallHealthy = false;
  }

  const payload = {
    status: overallHealthy ? 'healthy' : 'degraded',
    timestamp,
    version: '0.1.0',
    services: {
      database: dbStatus,
      auth: authConfigured ? 'configured' : 'pending_configuration',
    },
  };

  return NextResponse.json(payload, {
    status: dbStatus === 'connected' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
