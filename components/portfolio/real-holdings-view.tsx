'use client';

import Link from 'next/link';

import { ListOrdered } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatValue } from '@/components/omni/primitives';
import { StaggerItem } from '@/components/omni/page-transition';
import { AddHoldingModal } from './add-holding-modal';
import { CsvImportModal } from './csv-import-modal';
import { StatementReaderModal } from './statement-reader-modal';
import { deleteHoldingAction, syncMarketPricesAction } from '@/app/portfolio/actions';
import type { UserHoldingView, PortfolioSummaryStats } from '@/lib/db/portfolio';
import type { Account, Instrument } from '@/lib/db/schema';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Plus,
  FileSpreadsheet,
  Trash2,
  ChevronRight,
  Info,
  Clock,
  Wallet,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';

const FILTERS = [
  'All',
  'Indian Stocks',
  'Mutual Funds',
  'ETFs',
  'Gold',
  'Fixed Income',
  'International',
] as const;

interface RealHoldingsViewProps {
  initialHoldings: UserHoldingView[];
  initialAccounts: Account[];
  instruments: Instrument[];
  initialSummary: PortfolioSummaryStats;
}

export function RealHoldingsView({
  initialHoldings,
  initialAccounts,
  instruments,
  initialSummary,
}: RealHoldingsViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  const holdings = initialHoldings;
  const summary = initialSummary;

  const filteredRows = useMemo(() => {
    return filter === 'All' ? holdings : holdings.filter((h) => h.assetClass === filter);
  }, [holdings, filter]);

  const handleDelete = (holdingId: string, symbol: string) => {
    if (!confirm(`Are you sure you want to remove ${symbol} from your portfolio?`)) {
      return;
    }

    setDeletingId(holdingId);
    startTransition(async () => {
      const res = await deleteHoldingAction(holdingId);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
      setDeletingId(null);
    });
  };

  const handleSyncPrices = () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    startTransition(async () => {
      const res = await syncMarketPricesAction();
      if (res.error) {
        setSyncFeedback({ message: res.error, type: 'error' });
      } else {
        setSyncFeedback({
          message: `Successfully synchronized ${res.updatedCount ?? 0} market prices across official feeds.`,
          type: 'success',
        });
        router.refresh();
      }
      setIsSyncing(false);
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Portfolio Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Total Invested (Cost Basis)</p>
            <StatValue
              value={formatINRCompact(summary.totalInvested)}
              className="mt-2 block text-3xl font-semibold"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Across {summary.holdingCount} {summary.holdingCount === 1 ? 'holding' : 'holdings'} in{' '}
              {summary.accountCount} {summary.accountCount === 1 ? 'account' : 'accounts'}
            </p>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="p-6 relative overflow-hidden">
            <p className="text-sm text-muted-foreground">Current Market Value</p>
            <div className="mt-2 flex items-baseline gap-2">
              {summary.hasAnyPricedHoldings && summary.totalCurrentValue != null ? (
                <>
                  <StatValue
                    value={formatINRCompact(summary.totalCurrentValue)}
                    className="text-3xl font-semibold"
                  />
                  {summary.isFullyPriced ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="size-3" /> Fully Priced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle className="size-3" /> {summary.pricedHoldingCount}/{summary.holdingCount} Priced
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-3xl font-serif text-muted-foreground">—</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
                    <Clock className="size-3" /> Awaiting Feed
                  </span>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.hasAnyPricedHoldings && summary.totalCurrentValue != null ? (
                summary.isFullyPriced ? (
                  'Verified valuation from official AMFI NAV and exchange closing feeds.'
                ) : (
                  `Partial valuation: ${summary.unpricedHoldingCount} holding${summary.unpricedHoldingCount === 1 ? ' awaits' : 's await'} official market quotes.`
                )
              ) : (
                'Sync official market data feeds to compute current portfolio valuation.'
              )}
            </p>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Unrealized Gain / P&L</p>
            <div className="mt-2 flex items-baseline gap-2">
              {summary.hasAnyPricedHoldings && summary.totalUnrealizedGain != null ? (
                <>
                  <span
                    className={cn(
                      'text-3xl font-semibold tnum',
                      summary.totalUnrealizedGain >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {summary.totalUnrealizedGain >= 0 ? '+' : ''}
                    {formatINRCompact(summary.totalUnrealizedGain)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border',
                      summary.totalUnrealizedGain >= 0
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    )}
                  >
                    {summary.totalUnrealizedGain >= 0 ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {summary.totalUnrealizedGainPct != null
                      ? `${summary.totalUnrealizedGain >= 0 ? '+' : ''}${summary.totalUnrealizedGainPct.toFixed(2)}%`
                      : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-serif text-muted-foreground">—</span>
                  <span className="text-xs text-muted-foreground">Awaiting market quotes</span>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.hasAnyPricedHoldings && !summary.isFullyPriced && (
                <>
                  On the {summary.pricedHoldingCount} priced holdings ({formatINRCompact(summary.pricedInvested)} cost).{' '}
                </>
              )}
              {summary.latestPriceTimestamp ? (
                <>
                  Latest quote as of{' '}
                  {new Date(summary.latestPriceTimestamp).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  .
                </>
              ) : (
                <>Strict mathematical P&L based solely on verified price feeds.</>
              )}
            </p>
          </Card>
        </StaggerItem>
      </div>

      {/* 2. Honest Market Feed Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <div className="leading-relaxed">
          <strong className="text-foreground">Honest Pricing & Valuation:</strong> OmniScope valuations
          are computed strictly from verified official closing sources: Net Asset Values from AMFI India,
          official EOD closing prices for NSE/BSE equities & ETFs, and official IBJA rates for Sovereign Gold
          Bonds. Mutual fund NAVs represent daily official end-of-day valuations, never intraday streaming prices.
          Holdings without a verified feed are clearly labeled and never substituted with fake data.
        </div>
      </div>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg px-4 py-2.5 text-xs border',
            syncFeedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
          )}
        >
          <span>{syncFeedback.message}</span>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-xs underline hover:opacity-80 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        {/* Filters */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by asset class">
          {FILTERS.map((f) => {
            const active = filter === f;
            const count =
              f === 'All' ? holdings.length : holdings.filter((h) => h.assetClass === f).length;
            if (count === 0 && f !== 'All') return null;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                )}
              >
                {f} {count > 0 && <span className="opacity-70 ml-1 text-[10px]">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href="/portfolio/ledger"
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent sm:flex-initial"
          >
            <ListOrdered className="size-3.5" />
            Transactions
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncPrices}
            disabled={isSyncing}
            className="text-xs h-8 gap-1.5 flex-1 sm:flex-initial"
            title="Fetch latest official NAVs from AMFI and closing market quotes"
          >
            <RefreshCw className={cn('size-3.5', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Syncing...' : 'Sync Prices'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsCsvOpen(true)}
            className="text-xs h-8 gap-1.5 flex-1 sm:flex-initial"
          >
            <FileSpreadsheet className="size-3.5" /> Import CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAiImportOpen(true)}
            className="text-xs h-8 gap-1.5 flex-1 sm:flex-initial"
          >
            <Sparkles className="size-3.5" /> AI Import Statement
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="text-xs h-8 gap-1.5 flex-1 sm:flex-initial shadow-sm"
          >
            <Plus className="size-3.5" /> Add Holding
          </Button>
        </div>
      </div>

      {/* 4. Holdings List or Empty State */}
      {holdings.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center border-dashed">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Wallet className="size-7" />
          </div>
          <h2 className="text-xl font-serif font-semibold text-foreground">Your Portfolio is Empty</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2 leading-relaxed">
            Record your stocks, mutual funds, gold bonds, or ETFs to track your financial wealth
            with real mathematical precision and multi-tenant security.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
            <Button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="w-full sm:w-auto gap-2"
            >
              <Plus className="size-4" /> Add First Holding
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCsvOpen(true)}
              className="w-full sm:w-auto gap-2"
            >
              <FileSpreadsheet className="size-4" /> Import from CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAiImportOpen(true)}
              className="w-full sm:w-auto gap-2"
            >
              <Sparkles className="size-4" /> AI Import Statement
            </Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-xl mx-auto mt-8 pt-8 border-t border-border text-left">
            <div>
              <p className="text-xs font-semibold text-foreground">No Broker Credentials</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                We never ask for passwords or PINs. Track securely.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Verified Catalogue</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Official ISINs and symbols from NSE, BSE & AMFI.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Multi-Tenant Isolation</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Protected by PostgreSQL Row Level Security.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-6">
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-[2fr_0.9fr_1fr_1.2fr_1.1fr_1.2fr_36px] gap-3 border-b border-border px-4 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid">
            <span>Holding & Account</span>
            <span className="text-right">Units</span>
            <span className="text-right">Avg. Cost</span>
            <span className="text-right">Price / NAV</span>
            <span className="text-right">Current Value</span>
            <span className="text-right">Unrealized P&L</span>
            <span />
          </div>

          <ul className="divide-y divide-border">
            {filteredRows.map((h) => {
              const isOpen = expanded === h.id;
              const isDeleting = deletingId === h.id;
              return (
                <li key={h.id}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : h.id)}
                      aria-expanded={isOpen}
                      className="grid w-full grid-cols-2 items-center gap-3 rounded-lg px-4 py-4 text-left transition-colors hover:bg-accent/40 md:grid-cols-[2fr_0.9fr_1fr_1.2fr_1.1fr_1.2fr_36px]"
                    >
                      {/* 1. Holding & Account */}
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronRight
                          className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform',
                            isOpen && 'rotate-90'
                          )}
                          aria-hidden
                        />
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold text-secondary-foreground uppercase">
                          {h.symbol.slice(0, 3)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {h.symbol} • {h.assetClass} •{' '}
                            <span className="text-foreground/80">{h.accountName}</span>
                          </p>
                        </div>
                      </div>

                      {/* 2. Units / Shares (Mobile right column shows current value or units) */}
                      <div className="text-right md:text-right">
                        <p className="tnum text-sm font-medium text-foreground">
                          {formatNumber(h.units, h.units % 1 ? 4 : 0)}
                        </p>
                        {/* Mobile summary */}
                        <div className="md:hidden mt-0.5">
                          {h.currentValue != null ? (
                            <p className="tnum text-xs font-semibold text-foreground">
                              {formatINR(h.currentValue)}
                            </p>
                          ) : (
                            <p className="tnum text-xs text-muted-foreground">
                              Cost: {formatINR(h.investedAmount)}
                            </p>
                          )}
                          {h.unrealizedGain != null && (
                            <p
                              className={cn(
                                'tnum text-[11px] font-medium',
                                h.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              )}
                            >
                              {h.unrealizedGain >= 0 ? '+' : ''}
                              {formatINR(h.unrealizedGain)} (
                              {h.unrealizedGain >= 0 ? '+' : ''}
                              {h.unrealizedGainPct?.toFixed(2)}%)
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 3. Avg Buy Price (Desktop) */}
                      <div className="hidden text-right md:block">
                        <p className="tnum text-sm text-foreground">
                          {formatINR(h.averageAcquisitionCost, { decimals: 2 })}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Cost: {formatINRCompact(h.investedAmount)}
                        </p>
                      </div>

                      {/* 4. Current Price / NAV (Desktop) */}
                      <div className="hidden text-right md:block">
                        {h.currentPrice != null ? (
                          <>
                            <p className="tnum text-sm font-medium text-foreground">
                              {formatINR(h.currentPrice, {
                                decimals: h.assetClass === 'Mutual Funds' ? 4 : 2,
                              })}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <span className="inline-flex rounded bg-secondary px-1 py-0.2 text-[9px] font-semibold text-secondary-foreground uppercase">
                                {h.priceType === 'UNVERIFIED_REFERENCE'
                                  ? 'REF'
                                  : h.priceType || (h.assetClass === 'Mutual Funds' ? 'NAV' : 'EOD')}
                              </span>
                              {h.isPriceStale && (
                                <span
                                  title={h.priceStatusLabel}
                                  className="inline-flex items-center rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-medium text-amber-600 border border-amber-500/20"
                                >
                                  {h.priceSource === 'STATIC_REFERENCE_FIXTURE' ||
                                  h.priceSource === 'STATIC_TEST_FIXTURE' ||
                                  h.priceSource === 'NSE_EOD_VERIFIED'
                                    ? 'Unverified'
                                    : 'Stale'}
                                </span>
                              )}
                            </div>
                          </>
                        ) : h.referencePrice != null ? (
                          <>
                            <p
                              className="tnum text-sm text-muted-foreground line-through decoration-muted-foreground/40"
                              title="Unverified catalogue reference price. Not used for valuation."
                            >
                              {formatINR(h.referencePrice, { decimals: 2 })}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <span className="inline-flex items-center rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-medium text-amber-700 border border-amber-500/20">
                                Ref only · awaiting verified feed
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="tnum text-sm text-muted-foreground font-serif">—</span>
                            <span className="block text-[10px] text-muted-foreground">
                              Awaiting Feed
                            </span>
                          </>
                        )}
                      </div>

                      {/* 5. Current Value (Desktop) */}
                      <div className="hidden text-right md:block">
                        {h.currentValue != null ? (
                          <p className="tnum text-sm font-semibold text-foreground">
                            {formatINR(h.currentValue)}
                          </p>
                        ) : (
                          <span className="tnum text-sm text-muted-foreground font-serif">—</span>
                        )}
                      </div>

                      {/* 6. Unrealized P&L (Desktop) */}
                      <div className="hidden text-right md:block">
                        {h.unrealizedGain != null ? (
                          <>
                            <p
                              className={cn(
                                'tnum text-sm font-semibold',
                                h.unrealizedGain >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {h.unrealizedGain >= 0 ? '+' : ''}
                              {formatINR(h.unrealizedGain)}
                            </p>
                            <p
                              className={cn(
                                'tnum text-xs',
                                h.unrealizedGain >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {h.unrealizedGain >= 0 ? '+' : ''}
                              {h.unrealizedGainPct != null ? h.unrealizedGainPct.toFixed(2) : '0.00'}%
                            </p>
                          </>
                        ) : (
                          <span className="tnum text-sm text-muted-foreground font-serif">—</span>
                        )}
                      </div>

                      {/* 7. Delete holding action */}
                      <div className="hidden justify-end md:flex">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(h.id, h.symbol);
                          }}
                          disabled={isDeleting}
                          title="Delete holding"
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </div>
                    </button>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isOpen && (
                    <div className="grid gap-x-8 gap-y-3 rounded-lg bg-muted/40 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">ISIN</p>
                        <p className="text-xs font-mono font-medium text-foreground mt-0.5">
                          {h.isin || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Exchange / Registry</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {h.exchange || 'NSE'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sector</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {h.sector || 'General'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Account Type</p>
                        <p className="text-xs font-medium text-foreground mt-0.5 uppercase">
                          {h.accountType}
                        </p>
                      </div>

                      {/* Valuation & Market Feed Provenance */}
                      <div>
                        <p className="text-xs text-muted-foreground">Price Source & Type</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {h.priceSource
                            ? `${h.priceSource} (${h.priceType || 'LTP'})`
                            : 'No feed linked'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Quote As-Of</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {h.priceTimestamp
                            ? new Date(h.priceTimestamp).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Awaiting sync'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Price Freshness</p>
                        <p
                          className={cn(
                            'text-xs font-medium mt-0.5',
                            h.isPriceStale ? 'text-amber-500 font-semibold' : 'text-foreground'
                          )}
                        >
                          {h.priceStatusLabel}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Day Change</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {h.dayChangePct != null
                            ? `${h.dayChangePct >= 0 ? '+' : ''}${h.dayChangePct.toFixed(2)}%`
                            : '—'}
                        </p>
                      </div>

                      {h.notes && (
                        <div className="sm:col-span-2 lg:col-span-4 border-t border-border/40 pt-2">
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="text-xs text-foreground mt-0.5">{h.notes}</p>
                        </div>
                      )}
                      <div className="sm:col-span-2 lg:col-span-4 flex justify-end md:hidden pt-2 border-t border-border/40">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(h.id, h.symbol)}
                          disabled={isDeleting}
                          className="text-xs h-7 gap-1"
                        >
                          <Trash2 className="size-3" /> Remove Position
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Modals */}
      <AddHoldingModal
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        accounts={initialAccounts}
        instruments={instruments}
      />
      <CsvImportModal open={isCsvOpen} onOpenChange={setIsCsvOpen} />
      <StatementReaderModal open={isAiImportOpen} onOpenChange={setIsAiImportOpen} />
    </div>
  );
}
