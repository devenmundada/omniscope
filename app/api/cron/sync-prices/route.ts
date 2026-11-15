import { type NextRequest, NextResponse } from 'next/server';
import { syncAllMarketPrices } from '@/lib/market-data/sync-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// In-Memory Mutex Flag & Timeout Tracker:
// -----------------------------------------------------------------------------------------
// OPERATIONAL ARCHITECTURE & CONCURRENCY CHARACTERISTICS:
//
// 1. Single-Process Mutex:
//    The in-memory lock (isSyncInProgress) provides concurrency protection within a single
//    persistent Node.js runtime process (e.g. dedicated container or long-running server).
//    In distributed, auto-scaling serverless environments (e.g. Vercel Serverless Functions),
//    separate concurrent requests can spin up independent container instances with isolated memory.
//
// 2. Transaction Pooler Constraints & PostgreSQL Advisory Locks:
//    Distributed locking via PostgreSQL session-level advisory locks (pg_try_advisory_lock)
//    is officially unsupported/discouraged in Supabase transaction-pooling mode (Supavisor port 6543 / 5432)
//    because pooled connections rotate across transactions, causing orphaned or prematurely dropped locks.
//
// 3. Database Data Integrity & Monotonic Timestamps:
//    Data integrity during overlapping runs is guaranteed at the database level by the conditional
//    upsert (`ON CONFLICT (instrument_id) DO UPDATE SET ... WHERE excluded.price_timestamp >= market_prices.price_timestamp`)
//    inside `syncAllMarketPrices()`. This ensures that even if two jobs execute out of order,
//    an older quote will NEVER overwrite a newer stored quote.
//
// 4. Remaining Concurrency Limitation:
//    The conditional upsert protects data integrity, but does NOT prevent duplicate external API requests
//    or provider rate-limit consumption across separate serverless instances. Production invocation
//    MUST be restricted to a single scheduled trigger per day (authenticated via CRON_SECRET).
//
// 5. Vercel Hobby Scheduling Characteristics:
//    On Vercel Hobby, cron jobs are limited to running once per day and can be delayed by up to
//    approximately 59 minutes after their scheduled UTC time (an asymmetric delay, not a symmetric window).
//
// 6. Resilience When Feeds Are Not Yet Published:
//    The sync job does NOT assume that daily NAV or EOD feeds are already published merely because
//    the scheduled trigger time has arrived. If AMFI or Twelve Data has not yet released today's data:
//    - AMFI returns the previous business day's official NAV with its historical date. The conditional
//      upsert safely ignores older observations or refreshes the existing timestamp idempotently.
//    - Twelve Data returns the latest finalized EOD close.
//    - If an upstream provider fails or returns HTTP errors, the error is recorded in the result payload,
//      existing database prices remain completely intact (safe partial failure), and the route reports
//      a successful partial sync without corrupting portfolio valuations.
// -----------------------------------------------------------------------------------------
let isSyncInProgress = false;
let syncStartedAt: number | null = null;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max duration

/**
 * Authenticated scheduled-job entry point for market data & NAV sync.
 * Protected by bearer token or x-cron-secret header matching CRON_SECRET.
 * Implements concurrency locks, safe partial failure, and secret-redacted logging.
 */
export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  // 1. Enforce Server-Side Secret Configuration
  if (!cronSecret) {
    logger.warn('Cron sync request rejected: CRON_SECRET is not configured in server environment.');
    return NextResponse.json(
      { error: 'Scheduled job authentication is unconfigured on server' },
      { status: 500 }
    );
  }

  // 2. Authenticate Request via Bearer Token or Header
  const authHeader = request.headers.get('authorization');
  const customHeader = request.headers.get('x-cron-secret');

  let providedToken: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (customHeader) {
    providedToken = customHeader.trim();
  }

  if (!providedToken || providedToken !== cronSecret) {
    logger.warn('Unauthorized cron sync invocation attempt.');
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing cron secret' },
      { status: 401 }
    );
  }

  // 3. Concurrency Lock: Prevent Overlapping Synchronization Runs
  const now = Date.now();
  if (isSyncInProgress) {
    if (syncStartedAt && now - syncStartedAt < SYNC_TIMEOUT_MS) {
      logger.warn('Cron sync skipped: Previous synchronization run is still actively in progress.');
      return NextResponse.json(
        {
          error: 'Synchronization job is currently running. Concurrent execution prevented.',
          startedAt: new Date(syncStartedAt).toISOString(),
        },
        { status: 409 }
      );
    }
    // Stale lock expired, reset
    logger.warn('Previous cron sync lock timed out (>5m). Resetting lock.');
    isSyncInProgress = false;
  }

  isSyncInProgress = true;
  syncStartedAt = now;

  try {
    logger.info('Starting scheduled market data synchronization job...');
    const startTime = Date.now();
    const result = await syncAllMarketPrices();
    const durationMs = Date.now() - startTime;

    logger.info(
      `Market data sync complete in ${durationMs}ms: ${result.updatedCount} updated, ${result.skippedCount} skipped, ${result.failedCount} failed.`
    );

    return NextResponse.json({
      success: true,
      durationMs,
      totalProcessed: result.totalProcessed,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      syncedAt: result.syncedAt.toISOString(),
      errorsCount: result.errors.length,
    });
  } catch (err) {
    logger.error('Scheduled market data sync encountered unhandled error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        success: false,
        error: 'Market data synchronization job failed',
      },
      { status: 500 }
    );
  } finally {
    isSyncInProgress = false;
    syncStartedAt = null;
  }
}
