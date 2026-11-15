import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instruments, marketPrices } from '@/lib/db/schema';
import { fetchAmfiNavs } from './amfi-provider';
import { fetchEquityQuotes } from './equity-provider';
import { fetchGoldAndDebtQuotes } from './gold-debt-provider';
import type { MarketQuote, SyncResult, StalenessInfo } from './types';
import { recordHistory, backfillHeldInstrumentHistory } from './history';

/**
 * Evaluates whether a recorded price is considered stale based on asset class and elapsed time.
 */
export function checkPriceStaleness(
  priceTimestamp: Date,
  assetClass: string,
  source?: string | null
): StalenessInfo {
  const now = new Date();
  const diffMs = now.getTime() - new Date(priceTimestamp).getTime();
  const ageHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  // If source is a static fixture or unverified reference, immediately mark as stale with awaiting feed badge
  if (
    source === 'STATIC_REFERENCE_FIXTURE' ||
    source === 'STATIC_TEST_FIXTURE' ||
    source === 'NSE_EOD_VERIFIED'
  ) {
    return {
      isStale: true,
      ageHours,
      displayStatus: 'Awaiting Verified Exchange Feed (Static Reference)',
      badgeTone: 'warning',
    };
  }

  if (assetClass === 'Mutual Funds') {
    // AMFI NAVs update once daily on business days. Weekend window is 72-96 hours.
    if (ageHours > 96) {
      return {
        isStale: true,
        ageHours,
        displayStatus: `Stale NAV (${Math.floor(ageHours / 24)}d old)`,
        badgeTone: 'warning',
      };
    }
    return {
      isStale: false,
      ageHours,
      displayStatus: 'Official AMFI NAV',
      badgeTone: 'success',
    };
  }

  if (assetClass === 'Indian Stocks' || assetClass === 'ETFs') {
    if (source === 'TWELVE_DATA') {
      if (ageHours > 72) {
        return {
          isStale: true,
          ageHours,
          displayStatus: `Stale EOD Close (${Math.floor(ageHours / 24)}d old)`,
          badgeTone: 'warning',
        };
      }
      return {
        isStale: false,
        ageHours,
        displayStatus: 'Twelve Data EOD Close',
        badgeTone: 'default',
      };
    }

    if (source === 'NSE_EOD' || source === 'BSE_EOD' || source === 'YAHOO_EOD') {
      if (ageHours > 72) {
        return {
          isStale: true,
          ageHours,
          displayStatus: `Stale EOD Close (${Math.floor(ageHours / 24)}d old)`,
          badgeTone: 'warning',
        };
      }
      return {
        isStale: false,
        ageHours,
        displayStatus: 'Exchange EOD Close',
        badgeTone: 'default',
      };
    }

    if (ageHours > 72) {
      return {
        isStale: true,
        ageHours,
        displayStatus: `Stale Close (${Math.floor(ageHours / 24)}d old)`,
        badgeTone: 'warning',
      };
    }
    return {
      isStale: false,
      ageHours,
      displayStatus: 'EOD Verified Close',
      badgeTone: 'default',
    };
  }

  if (assetClass === 'Gold') {
    return {
      isStale: ageHours > 120,
      ageHours,
      displayStatus: source === 'GOLD_REFERENCE_ESTIMATE' ? 'Gold reference (COMEX × USD/INR + duty)' : 'IBJA Gold Benchmark',
      badgeTone: 'default',
    };
  }

  return {
    isStale: false,
    ageHours,
    displayStatus: 'Accrual Value',
    badgeTone: 'default',
  };
}

/**
 * Synchronizes market prices across all registered instruments in public.instruments.
 * Executes idempotent upserts against public.market_prices.
 */
export async function syncAllMarketPrices(): Promise<SyncResult> {
  const allInstruments = await db.select().from(instruments);
  const quotesToUpsert: MarketQuote[] = [];
  const errors: Array<{ identifier: string; error: string }> = [];

  // 1. Fetch Mutual Fund NAVs from official AMFI feed
  const mfInstruments = allInstruments.filter(
    (i) => i.assetClass === 'Mutual Funds' || i.amfiCode
  );

  if (mfInstruments.length > 0) {
    try {
      const amfiRes = await fetchAmfiNavs(mfInstruments);
      quotesToUpsert.push(...amfiRes.quotes);
      amfiRes.errors.forEach((err) => {
        errors.push({ identifier: 'AMFI_FEED', error: err });
      });
    } catch (err) {
      errors.push({
        identifier: 'AMFI_PROVIDER',
        error: `AMFI NAV sync failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 2. Fetch Equity and ETF quotes
  const equityInstruments = allInstruments.filter(
    (i) => i.assetClass === 'Indian Stocks' || i.assetClass === 'ETFs'
  );

  if (equityInstruments.length > 0) {
    try {
      const eqRes = await fetchEquityQuotes(equityInstruments);
      quotesToUpsert.push(...eqRes.quotes);
      eqRes.errors.forEach((err) => {
        errors.push({ identifier: 'EQUITY_FEED', error: err });
      });
    } catch (err) {
      errors.push({
        identifier: 'EQUITY_PROVIDER',
        error: `Equity price sync failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Fetch Gold and Fixed Income valuations
  const goldDebtInstruments = allInstruments.filter(
    (i) => i.assetClass === 'Gold' || i.assetClass === 'Fixed Income'
  );

  if (goldDebtInstruments.length > 0) {
    try {
      const gdRes = await fetchGoldAndDebtQuotes(goldDebtInstruments);
      quotesToUpsert.push(...gdRes.quotes);
      gdRes.errors.forEach((err) => {
        errors.push({ identifier: 'GOLD_DEBT_FEED', error: err });
      });
    } catch (err) {
      errors.push({
        identifier: 'GOLD_DEBT_PROVIDER',
        error: `Gold & Debt sync failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 4. Ingest and upsert into database idempotently
  let updatedCount = 0;

  for (const q of quotesToUpsert) {
    try {
      await db
        .insert(marketPrices)
        .values({
          instrumentId: q.instrumentId,
          price: q.price.toFixed(4),
          currency: q.currency,
          previousClose: q.previousClose != null ? q.previousClose.toFixed(4) : null,
          dayChange: q.dayChange != null ? q.dayChange.toFixed(4) : null,
          dayChangePct: q.dayChangePct != null ? q.dayChangePct.toFixed(2) : null,
          high: q.high != null ? q.high.toFixed(4) : null,
          low: q.low != null ? q.low.toFixed(4) : null,
          priceTimestamp: q.priceTimestamp,
          source: q.source,
          priceType: q.priceType,
          isRealtime: q.isRealtime,
          metadata: q.metadata || {},
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: marketPrices.instrumentId,
          set: {
            price: sql`excluded.price`,
            currency: sql`excluded.currency`,
            previousClose: sql`excluded.previous_close`,
            dayChange: sql`excluded.day_change`,
            dayChangePct: sql`excluded.day_change_pct`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            priceTimestamp: sql`excluded.price_timestamp`,
            source: sql`excluded.source`,
            priceType: sql`excluded.price_type`,
            isRealtime: sql`excluded.is_realtime`,
            metadata: sql`excluded.metadata`,
            updatedAt: new Date(),
          },
          // Concurrency & Out-of-Order Safety:
          // Strictly prevent an older observation from overwriting a newer stored quote
          // when two scheduled sync jobs overlap, lag, or finish out of order.
          where: sql`excluded.price_timestamp >= ${marketPrices.priceTimestamp} OR ${marketPrices.priceTimestamp} IS NULL`,
        });

      updatedCount++;
    } catch (err) {
      errors.push({
        identifier: q.symbol,
        error: `Failed to persist price for ${q.symbol}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 5. Persist daily history (verified observations only) and backfill held instruments.
  try {
    await recordHistory(quotesToUpsert);
    const bf = await backfillHeldInstrumentHistory();
    bf.errors.forEach((e) => errors.push({ identifier: 'HISTORY_BACKFILL', error: e }));
  } catch (err) {
    errors.push({
      identifier: 'PRICE_HISTORY',
      error: `Price history update failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return {
    totalProcessed: allInstruments.length,
    updatedCount,
    skippedCount: allInstruments.length - updatedCount,
    failedCount: errors.length,
    errors,
    syncedAt: new Date(),
  };
}
