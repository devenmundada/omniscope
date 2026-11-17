'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { InsightBlock, StatValue } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { MarketCapBar } from '@/components/xray/market-cap-bar';
import { formatINR, formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { XRayAnalytics } from '@/lib/db/xray';
import {
  PieChart,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  HelpCircle,
  Info,
  ArrowUpRight,
  BarChart3,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface RealXRayViewProps {
  analytics: XRayAnalytics;
}

const ASSET_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-slate-500',
];

export function RealXRayView({ analytics }: RealXRayViewProps) {
  const [showHhiDetails, setShowHhiDetails] = useState(false);
  const [allocationMode, setAllocationMode] = useState<'marketValue' | 'costBasis'>('marketValue');

  const {
    dataQuality,
    assetClassAllocations,
    sectorExposures,
    marketCapExposures,
    concentration,
    accountExposures,
    lookThrough,
    practicalInsights,
  } = analytics;

  // Empty state handling
  if (!analytics.hasHoldings || concentration.topHoldings.length === 0) {
    return (
      <StaggerItem>
        <Card className="p-8 text-center border-dashed">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <PieChart className="size-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No Holdings in Portfolio</h2>
          <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground leading-relaxed">
            Your user partition is initialized, but no holdings have been recorded yet. Add your positions or import a statement CSV on your Portfolio page to unlock deep portfolio X-Ray analytics.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Go to Portfolio & Add Holdings <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </Card>
      </StaggerItem>
    );
  }

  // Format market cap data for MarketCapBar component
  const marketCapChartData = marketCapExposures.map((mc) => ({
    name: mc.category,
    pct: Math.round((allocationMode === 'marketValue' ? mc.verifiedWeightPct : mc.costWeightPct) * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      {/* 1. Practical Descriptive Insights */}
      {practicalInsights.length > 0 && (
        <StaggerItem>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {practicalInsights.map((insight, idx) => {
              const toneMap: Record<string, 'positive' | 'attention' | 'neutral' | 'high'> = {
                success: 'positive',
                warning: 'attention',
                info: 'neutral',
                default: 'neutral',
              };
              return (
                <InsightBlock
                  key={idx}
                  tone={toneMap[insight.tone] || 'neutral'}
                  title={insight.title}
                  body={insight.description}
                />
              );
            })}
          </div>
        </StaggerItem>
      )}

      {/* 2. Valuation Denominator & Honest Data Quality Card */}
      <StaggerItem>
        <Card className="p-5 bg-muted/30 border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Analytics Valuation Scope
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-3" /> {dataQuality.pricedHoldingsCount}/{dataQuality.totalHoldingsCount} Verified Priced
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground">
                Verified Market Value Subtotal:{' '}
                <strong className="text-base font-semibold tnum">
                  {formatINR(dataQuality.verifiedMarketValueTotal)}
                </strong>
                <span className="text-xs text-muted-foreground ml-2">
                  (Denominator for all market-value percentages)
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {dataQuality.unpricedHoldingsCount > 0 ? (
                  <>
                    <strong className="text-foreground">{dataQuality.unpricedHoldingsCount} position{dataQuality.unpricedHoldingsCount === 1 ? '' : 's'}</strong> (total cost basis {formatINRCompact(dataQuality.unpricedCostBasisTotal)}) {dataQuality.unpricedHoldingsCount === 1 ? 'awaits' : 'await'} verified exchange feeds and {dataQuality.unpricedHoldingsCount === 1 ? 'is' : 'are'} excluded from market-value percentages. Never counted as zero market value.
                  </>
                ) : (
                  'All active positions are priced using official AMFI NAVs, Twelve Data EOD closes, IBJA gold benchmarks, or bank accruals.'
                )}
              </p>
            </div>

            {/* Toggle calculation denominator basis */}
            <div className="flex items-center gap-1 bg-background border border-border p-1 rounded-lg shrink-0 self-start md:self-center">
              <button
                type="button"
                onClick={() => setAllocationMode('marketValue')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  allocationMode === 'marketValue'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Market Value Weights
              </button>
              <button
                type="button"
                onClick={() => setAllocationMode('costBasis')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  allocationMode === 'costBasis'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Cost Basis Weights
              </button>
            </div>
          </div>

          {/* Feed Provenance Breakdown */}
          <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Verified Feed Sources:</span>
            {dataQuality.feedBreakdown.amfiNavCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px]">
                AMFI NAV ({dataQuality.feedBreakdown.amfiNavCount})
              </span>
            )}
            {dataQuality.feedBreakdown.exchangeEodCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px]">
                Exchange EOD ({dataQuality.feedBreakdown.exchangeEodCount})
              </span>
            )}
            {dataQuality.feedBreakdown.goldBenchmarkCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px]">
                Gold reference ({dataQuality.feedBreakdown.goldBenchmarkCount})
              </span>
            )}
            {dataQuality.feedBreakdown.bankAccrualCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px]">
                Bank Accrual ({dataQuality.feedBreakdown.bankAccrualCount})
              </span>
            )}
            {dataQuality.feedBreakdown.unverifiedFixtureCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 text-amber-600 px-2 py-0.5 text-[11px] border border-amber-500/20">
                Awaiting Verified Feed ({dataQuality.feedBreakdown.unverifiedFixtureCount})
              </span>
            )}
          </div>
        </Card>
      </StaggerItem>

      {/* 3. Concentration Analysis & Herfindahl-Hirschman Index (HHI) */}
      <StaggerItem>
        <Card className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Portfolio Concentration & Herfindahl-Hirschman Index (HHI)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowHhiDetails(!showHhiDetails)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="What is HHI?"
                >
                  <Info className="size-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                Evaluates capital distribution across your verified positions. Lower concentration reduces vulnerability to idiosyncratic shocks.
              </p>
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase font-semibold">HHI Concentration Score</p>
                <div className="mt-1 flex items-baseline justify-end gap-2">
                  <StatValue value={concentration.hhi > 0 ? concentration.hhi.toString() : '—'} className="text-3xl font-bold" />
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                      concentration.hhiClassification === 'Well Diversified'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : concentration.hhiClassification === 'Moderately Concentrated'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          : concentration.hhiClassification === 'Highly Concentrated'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    {concentration.hhiClassification === 'Well Diversified' && <ShieldCheck className="size-3.5" />}
                    {concentration.hhiClassification === 'Moderately Concentrated' && <AlertCircle className="size-3.5" />}
                    {concentration.hhiClassification === 'Highly Concentrated' && <ShieldAlert className="size-3.5" />}
                    {concentration.hhiClassification}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Concentration Ratios (CR1, CR3, CR5) */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Largest Position (CR₁)</p>
              <p className="mt-1 text-2xl font-semibold tnum text-foreground">
                {concentration.top1WeightPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {concentration.topHoldings[0]?.name || 'N/A'}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Top 3 Positions (CR₃)</p>
              <p className="mt-1 text-2xl font-semibold tnum text-foreground">
                {concentration.top3WeightPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Share of verified priced portfolio
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Top 5 Positions (CR₅)</p>
              <p className="mt-1 text-2xl font-semibold tnum text-foreground">
                {concentration.top5WeightPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cumulative top-5 weight
              </p>
            </div>
          </div>

          {/* Expandable Explanation of Calculation Basis */}
          {showHhiDetails && (
            <div className="mt-4 rounded-xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground border border-border">
              <h3 className="font-semibold text-foreground mb-1">Calculation Methodology & Practical Limitations:</h3>
              <p>{concentration.hhiExplanation}</p>
              <div className="mt-3 grid sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded bg-background border border-border">
                  <span className="font-semibold text-foreground">Score &lt; 1,500:</span> Well Diversified
                </div>
                <div className="p-2 rounded bg-background border border-border">
                  <span className="font-semibold text-foreground">1,500 – 2,500:</span> Moderately Concentrated
                </div>
                <div className="p-2 rounded bg-background border border-border">
                  <span className="font-semibold text-foreground">Score &gt; 2,500:</span> Highly Concentrated
                </div>
              </div>
            </div>
          )}
        </Card>
      </StaggerItem>

      {/* 4. Asset Class Allocation & Sector Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Asset Class Allocation */}
        <StaggerItem>
          <Card className="p-6 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">Asset Class Allocation</h3>
                <span className="text-xs text-muted-foreground">
                  {allocationMode === 'marketValue' ? 'By Verified Market Value' : 'By Invested Cost Basis'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Distribution across liquid equity, mutual funds, gold, and fixed income.
              </p>

              {/* Stacked allocation bar */}
              <div className="flex h-5 w-full items-stretch overflow-hidden rounded-md bg-muted mb-5">
                {assetClassAllocations.map((ac, idx) => {
                  const pct = allocationMode === 'marketValue' ? ac.verifiedWeightPct : ac.costWeightPct;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={ac.assetClass}
                      className={ASSET_COLORS[idx % ASSET_COLORS.length]}
                      style={{ width: `${pct}%` }}
                      title={`${ac.assetClass}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>

              {/* List */}
              <ul className="space-y-3">
                {assetClassAllocations.map((ac, idx) => {
                  const pct = allocationMode === 'marketValue' ? ac.verifiedWeightPct : ac.costWeightPct;
                  const val = allocationMode === 'marketValue' ? ac.verifiedValue : ac.costBasis;
                  return (
                    <li key={ac.assetClass} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn('size-2.5 rounded-full shrink-0', ASSET_COLORS[idx % ASSET_COLORS.length])}
                          aria-hidden
                        />
                        <span className="font-medium text-foreground">{ac.assetClass}</span>
                        <span className="text-xs text-muted-foreground">
                          ({ac.holdingCount} {ac.holdingCount === 1 ? 'pos' : 'pos'})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="tnum font-semibold text-foreground mr-3">{pct.toFixed(1)}%</span>
                        <span className="tnum text-xs text-muted-foreground">{formatINR(val)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </StaggerItem>

        {/* Sector Exposure */}
        <StaggerItem>
          <Card className="p-6 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">Sector Exposure</h3>
                <span className="text-xs text-muted-foreground">
                  {allocationMode === 'marketValue' ? 'Priced Market Share' : 'Cost Share'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Industry reliance across verified positions. Holdings without sector classifications are explicitly identified.
              </p>

              <ul className="space-y-4">
                {sectorExposures.map((sec) => {
                  const pct = allocationMode === 'marketValue' ? sec.verifiedWeightPct : sec.costWeightPct;
                  const val = allocationMode === 'marketValue' ? sec.verifiedValue : sec.costBasis;
                  return (
                    <li key={sec.sector}>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('text-sm', sec.isUnclassified ? 'text-amber-500 font-medium' : 'text-foreground font-medium')}>
                            {sec.sector}
                          </span>
                          {sec.isUnclassified && (
                            <span className="text-[10px] text-amber-500 font-mono bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                              Awaiting Classification
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="tnum font-semibold text-foreground mr-3">{pct.toFixed(1)}%</span>
                          <span className="tnum text-xs text-muted-foreground">{formatINRCompact(val)}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            sec.isUnclassified ? 'bg-amber-500/60' : 'bg-primary'
                          )}
                          style={{ width: `${Math.min(100, Math.max(1, pct))}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </StaggerItem>
      </div>

      {/* 5. Market Cap Distribution & Account Exposures */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Market Cap Distribution */}
        <StaggerItem>
          <Card className="p-6">
            <h3 className="text-base font-semibold text-foreground mb-1">Market Capitalization Split</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Capital distribution across Large Cap, Mid Cap, Small Cap, and Multi-Cap strategies.
            </p>
            <MarketCapBar data={marketCapChartData} />
          </Card>
        </StaggerItem>

        {/* Account Exposures */}
        <StaggerItem>
          <Card className="p-6">
            <h3 className="text-base font-semibold text-foreground mb-1">Exposure Across Portfolio Accounts</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Breakdown of total capital by custodian institution and account classification.
            </p>

            <ul className="space-y-3">
              {accountExposures.map((acc) => {
                const pct = allocationMode === 'marketValue' ? acc.verifiedWeightPct : acc.costWeightPct;
                const val = allocationMode === 'marketValue' ? acc.verifiedValue : acc.costBasis;
                return (
                  <li key={acc.accountId} className="flex items-center justify-between rounded-lg bg-muted/30 p-3 border border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground font-semibold text-xs uppercase">
                        {acc.accountType.slice(0, 3)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{acc.accountName}</p>
                        <p className="text-[11px] text-muted-foreground uppercase">{acc.accountType} · {acc.holdingCount} {acc.holdingCount === 1 ? 'position' : 'positions'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-semibold text-foreground">{formatINR(val)}</p>
                      <p className="tnum text-xs text-muted-foreground">{pct.toFixed(1)}% of portfolio</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </StaggerItem>
      </div>

      {/* 6. Top Holdings Concentration Table */}
      <StaggerItem>
        <Card className="p-6 overflow-hidden">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Ranked Holdings & Weighting</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every position in your portfolio, sorted by verified market value.
              </p>
            </div>
            <Link
              href="/portfolio"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Manage Positions in Portfolio <ArrowUpRight className="size-3" />
            </Link>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-semibold">Security / Asset</th>
                  <th className="pb-3 font-semibold text-right">Units</th>
                  <th className="pb-3 font-semibold text-right">Price / NAV</th>
                  <th className="pb-3 font-semibold text-right">Verified Value</th>
                  <th className="pb-3 font-semibold text-right">Portfolio Weight</th>
                  <th className="pb-3 font-semibold text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {concentration.topHoldings.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-foreground text-sm">{h.name}</div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-mono font-medium">{h.symbol}</span>
                        <span>·</span>
                        <span>{h.assetClass}</span>
                        {h.sector && (
                          <>
                            <span>·</span>
                            <span>{h.sector}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right tnum font-medium text-foreground">
                      {h.units.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {h.currentPrice != null ? (
                        <>
                          <div className="tnum font-medium text-foreground">
                            {formatINR(h.currentPrice, { decimals: h.assetClass === 'Mutual Funds' ? 4 : 2 })}
                          </div>
                          <span className="inline-flex rounded bg-secondary px-1 py-0.2 text-[9px] font-semibold text-secondary-foreground uppercase mt-0.5">
                            {h.priceType || 'EOD'}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground font-serif">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right tnum font-semibold text-foreground">
                      {h.verifiedValue != null ? (
                        formatINR(h.verifiedValue)
                      ) : (
                        <div className="text-muted-foreground">
                          <span className="font-serif">—</span>
                          <span className="block text-[10px] text-amber-500 font-sans">Awaiting Feed</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {h.verifiedWeightPct != null ? (
                        <span className="tnum font-semibold text-foreground text-sm">
                          {h.verifiedWeightPct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="tnum text-muted-foreground text-xs font-mono">Cost: {h.costWeightPct.toFixed(1)}%</span>
                      )}
                    </td>
                    <td className="py-3 pl-2 text-right">
                      {h.unrealizedGain != null ? (
                        <div>
                          <span
                            className={cn(
                              'tnum font-semibold text-xs',
                              h.unrealizedGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            )}
                          >
                            {h.unrealizedGain >= 0 ? '+' : ''}
                            {formatINR(h.unrealizedGain)}
                          </span>
                          <span
                            className={cn(
                              'block tnum text-[10px]',
                              h.unrealizedGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            )}
                          >
                            ({h.unrealizedGainPct != null ? `${h.unrealizedGainPct >= 0 ? '+' : ''}${h.unrealizedGainPct.toFixed(1)}%` : '0.0%'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-serif">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StaggerItem>

      {/* 7. Mutual Fund Constituent Look-Through (Honest Disclosure) */}
      <StaggerItem>
        <Card className="p-6 bg-muted/20 border-border">
          <div className="flex items-start gap-3">
            <Info className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Underlying Fund Constituent Look-Through
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {lookThrough.explanation}
              </p>
              <p className="text-xs text-muted-foreground/80 pt-1">
                OmniScope strictly avoids simulating synthetic constituent weights or fabricating fund overlap percentages. Your direct stock positions and mutual fund asset classes are analyzed directly from verified custody records.
              </p>
            </div>
          </div>
        </Card>
      </StaggerItem>
    </div>
  );
}
