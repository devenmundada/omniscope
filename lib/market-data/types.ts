/**
 * OmniScope Market Data Types & Provider Interfaces
 */

export type PriceType = 'NAV' | 'LTP' | 'EOD' | 'REDEMPTION' | 'UNVERIFIED_REFERENCE';

export interface MarketQuote {
  instrumentId: string;
  symbol: string;
  price: number;
  currency: string;
  dayChange?: number | null;
  dayChangePct?: number | null;
  previousClose?: number | null;
  high?: number | null;
  low?: number | null;
  priceTimestamp: Date;
  source: string;
  priceType: PriceType;
  isRealtime: boolean;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  totalProcessed: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ identifier: string; error: string }>;
  syncedAt: Date;
}

export interface StalenessInfo {
  isStale: boolean;
  ageHours: number;
  displayStatus: string;
  badgeTone: 'default' | 'success' | 'warning' | 'danger';
}
