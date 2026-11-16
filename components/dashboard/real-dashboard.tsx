import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, FileSpreadsheet, Plus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Delta } from '@/components/omni/primitives';
import { AnimatedNumber } from '@/components/omni/animated-number';
import { DonutChart, type DonutDatum } from '@/components/omni/donut-chart';
import { ScoreRing } from '@/components/omni/score-ring';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import type { FinancialSnapshot } from '@/lib/ai/snapshot';
import { formatINRCompact } from '@/lib/format';
import { BenchmarkChart } from './benchmark-chart';
import { MarketStory, MarketStorySkeleton } from './market-story';

export function RealDashboard({ userId, snapshot }: { userId: string; snapshot: FinancialSnapshot }) {
  const { summary, health, performance, xray } = snapshot;
  const ps = summary.portfolioSummary;

  if (summary.holdings.length === 0) {
    return (
      <Card className="mx-auto max-w-2xl p-10 text-center">
        <Sparkles className="mx-auto size-8 text-primary" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold">Welcome to OmniScope</h1>
        <p className="mt-2 text-muted-foreground">
          Add your first holdings to unlock your verified dashboard, AI news analysis, Monte Carlo goal probabilities and
          the AI Copilot.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="size-4" aria-hidden /> Add holdings
          </Link>
          <Link href="/portfolio" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium">
            <FileSpreadsheet className="size-4" aria-hidden /> Import a statement with AI
          </Link>
        </div>
      </Card>
    );
  }

  const value = ps.totalCurrentValue;
  const priced = summary.holdings.filter((h) => h.currentValue != null);
  let dayChange = 0;
  let hasDay = false;
  for (const h of priced) {
    if (h.dayChangePct == null) continue;
    hasDay = true;
    dayChange += h.currentValue! - h.currentValue! / (1 + h.dayChangePct / 100);
  }
  const dayPct = hasDay && value != null && value - dayChange > 0 ? (dayChange / (value - dayChange)) * 100 : null;

  const sims = snapshot.goalSimulations.filter((g) => g.simulation != null);
  const likelyGoals = sims.filter((g) => g.simulation!.nominal.probabilityOfSuccess >= 0.5).length;

  const allocation: DonutDatum[] = (xray?.assetClassAllocations ?? [])
    .filter((a) => a.verifiedValue > 0)
    .map((a) => ({ name: a.assetClass, value: a.verifiedValue, pct: a.verifiedWeightPct }));

  const growth = performance?.growth ?? [];
  const beat =
    performance?.portfolioReturn1yPct != null && performance.benchmarkReturnPct != null
      ? performance.portfolioReturn1yPct - performance.benchmarkReturnPct
      : null;

  return (
    <StaggerContainer>
      <StaggerItem className="mb-10">
        <Suspense fallback={<MarketStorySkeleton />}>
          <MarketStory userId={userId} snapshot={snapshot} />
        </Suspense>
      </StaggerItem>

      <div className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="flex h-full lg:col-span-2">
          <Card className="flex w-full flex-col justify-between gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Verified portfolio value</p>
                <div className="mt-2 flex items-baseline gap-3">
                  {value != null ? <AnimatedNumber value={value} className="text-5xl" /> : <span className="text-3xl font-semibold">Awaiting prices</span>}
                  {dayPct != null && <Delta value={dayPct} />}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Invested <span className="tnum font-medium text-foreground">{formatINRCompact(ps.totalInvested)}</span>
                  {ps.totalUnrealizedGain != null && (
                    <>
                      <span className="mx-2 text-border">·</span>
                      <span className={'tnum font-medium ' + (ps.totalUnrealizedGain >= 0 ? 'text-success' : 'text-danger')}>
                        {formatINRCompact(ps.totalUnrealizedGain)} {ps.totalUnrealizedGain >= 0 ? 'gained' : 'down'}
                      </span>
                    </>
                  )}
                  {ps.unpricedHoldingCount > 0 && (
                    <span className="ml-2 text-xs">({ps.unpricedHoldingCount} holding{ps.unpricedHoldingCount > 1 ? 's' : ''} awaiting a verified price)</span>
                  )}
                </p>
              </div>
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                View holdings <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
              <MiniStat
                label="XIRR (annualised)"
                value={performance?.xirrPct != null ? `${performance.xirrPct.toFixed(1)}%` : '—'}
                tone={performance?.xirrPct != null ? (performance.xirrPct >= 0 ? 'success' : 'danger') : undefined}
                hint={
                  performance && performance.xirrCoverage.holdingsWithDate < performance.xirrCoverage.holdingsTotal
                    ? `${performance.xirrCoverage.holdingsWithDate}/${performance.xirrCoverage.holdingsTotal} with buy dates`
                    : undefined
                }
              />
              <MiniStat
                label="Today"
                value={hasDay ? `${dayChange >= 0 ? '+' : '−'}${formatINRCompact(Math.abs(dayChange))}` : '—'}
                tone={hasDay ? (dayChange >= 0 ? 'success' : 'danger') : undefined}
              />
              <MiniStat
                label="Goals likely (≥50%)"
                value={sims.length ? `${likelyGoals} of ${sims.length}` : 'No goals'}
                hint="Monte Carlo, 10,000 paths"
              />
              <MiniStat
                label="vs Nifty 50 (1y)"
                value={beat != null ? `${beat >= 0 ? '+' : ''}${beat.toFixed(1)} pts` : '—'}
                tone={beat != null ? (beat >= 0 ? 'success' : 'danger') : undefined}
              />
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem className="flex h-full">
          <Card className="flex w-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-muted-foreground">Financial Health</p>
            {health.overallScore != null ? (
              <ScoreRing score={health.overallScore} label="out of 100" />
            ) : (
              <p className="text-sm text-muted-foreground">Complete your profile to get a score.</p>
            )}
            <Link href="/health" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              See what to improve <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Card>
        </StaggerItem>
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-5">
        <StaggerItem className="flex h-full lg:col-span-3">
          <Card className="w-full p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Portfolio vs Nifty 50</h2>
                <p className="text-sm text-muted-foreground">Last 12 months, from verified daily closing prices</p>
              </div>
              {performance?.portfolioReturn1yPct != null && <Delta value={performance.portfolioReturn1yPct} size="sm" />}
            </div>
            {growth.length > 1 ? (
              <>
                <BenchmarkChart data={growth} />
                <p className="mt-3 text-xs text-muted-foreground">{performance?.growthNote}</p>
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Price history is building. Click &quot;Sync Prices&quot; on the Portfolio page to backfill a year of history.
              </p>
            )}
          </Card>
        </StaggerItem>
        <StaggerItem className="flex h-full lg:col-span-2">
          <Card className="w-full p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-foreground">Where your money is</h2>
              <p className="text-sm text-muted-foreground">Verified value by asset class</p>
            </div>
            {allocation.length > 0 ? (
              <DonutChart data={allocation} centerValue={`${allocation.length}`} centerLabel="asset classes" />
            ) : (
              <p className="text-sm text-muted-foreground">No verified prices yet.</p>
            )}
          </Card>
        </StaggerItem>
      </section>
    </StaggerContainer>
  );
}

function MiniStat({ label, value, tone, hint }: { label: string; value: string; tone?: 'success' | 'danger'; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={'tnum mt-1 text-lg font-semibold ' + (tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-foreground')}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
