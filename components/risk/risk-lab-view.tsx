'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Activity, Gauge, ShieldAlert, Sigma, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { InsightBlock, PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import type { RiskReport } from '@/lib/db/risk';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CorrelationHeatmap, DrawdownChart, pct, signedPct } from './risk-charts';
import { OptimizerPanel } from './optimizer-panel';
import { StressPanel } from './stress-panel';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function RiskLabView({ report }: { report: RiskReport }) {
  const m = report.metrics;
  const b = report.benchmark;
  const value = report.analysedValue;

  // Diversification benefit: how much lower portfolio risk is than the weighted risk of its parts.
  const standalone = report.assets.reduce((s, a) => s + a.weight * a.annualVolatility, 0);
  const diversificationBenefit = standalone > 0 ? 1 - m.annualVolatility / standalone : 0;
  const hotspot = [...report.assets].sort((x, y) => y.riskShare - y.weight - (x.riskShare - x.weight))[0];
  const offsets = report.assets.filter((a) => a.betaGold > 0.7 && a.betaEquity < 0.3);

  const insights: Array<{ tone: 'high' | 'attention' | 'positive' | 'neutral'; title: string; body: string }> = [];
  if (hotspot && hotspot.riskShare > hotspot.weight * 1.25 && hotspot.riskShare > 0.15) {
    insights.push({
      tone: 'attention',
      title: `${hotspot.symbol} is ${pct(hotspot.weight, 0)} of your money but ${pct(hotspot.riskShare, 0)} of your risk`,
      body: `Its daily swings (${pct(hotspot.annualVolatility, 0)} a year) are large relative to the rest of the portfolio, so it drives most of the ups and downs you feel.`,
    });
  }
  insights.push({
    tone: m.annualReturn >= (b.annualReturn ?? 0) ? 'positive' : 'neutral',
    title: `${pct(m.annualReturn)} a year against ${pct(b.annualReturn)} for the Nifty 50`,
    body: `Over ${Math.round(m.observations / 21)} months your portfolio ${m.annualVolatility > b.annualVolatility ? 'took a little more' : 'took less'} day-to-day risk than the index (${pct(m.annualVolatility)} vs ${pct(b.annualVolatility)} volatility) and its worst fall was ${pct(m.maxDrawdown)} vs ${pct(b.maxDrawdown)}.`,
  });
  if (diversificationBenefit > 0.05) {
    insights.push({
      tone: 'positive',
      title: `Diversification is cutting your risk by ${pct(diversificationBenefit, 0)}`,
      body: offsets.length
        ? `${offsets.map((a) => a.symbol).join(' and ')} barely move with shares (equity beta near zero), so gold and equity losses rarely arrive on the same day.`
        : 'Your holdings do not all fall on the same days, so the whole is calmer than its parts.',
    });
  }

  return (
    <StaggerContainer>
      <StaggerItem>
        <PageHeader
          eyebrow="Risk Lab"
          title="How much risk are you really taking?"
          question={`Two years of verified daily prices (${dayLabel(m.fromDate)} to ${dayLabel(m.toDate)}), run through the models professional risk desks use.`}
        />
      </StaggerItem>

      <StaggerItem>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={<TrendingUp className="size-4" />} label="Annual return" value={pct(m.annualReturn)} hint={`Nifty 50: ${pct(b.annualReturn)}`} tone={m.annualReturn >= 0 ? 'good' : 'bad'} />
          <Kpi icon={<Activity className="size-4" />} label="Volatility" value={pct(m.annualVolatility)} hint={`Nifty 50: ${pct(b.annualVolatility)}`} />
          <Kpi icon={<Gauge className="size-4" />} label="Sharpe ratio" value={m.sharpe.toFixed(2)} hint={`Return per unit of risk above ${pct(report.riskFree, 0)}`} />
          <Kpi icon={<TrendingDown className="size-4" />} label="Worst fall" value={`−${pct(m.maxDrawdown)}`} hint={`${dayLabel(m.maxDrawdownFrom)} → ${dayLabel(m.maxDrawdownTo)}`} tone="bad" />
          <Kpi icon={<ShieldAlert className="size-4" />} label="1-month VaR (95%)" value={formatINRCompact(m.var95Monthly * value)} hint={`1 month in 20 is worse; then ~${formatINRCompact(m.cvar95Monthly * value)}`} tone="bad" />
          <Kpi icon={<Sigma className="size-4" />} label="Beta to Nifty" value={m.beta != null ? m.beta.toFixed(2) : '—'} hint={m.alpha != null ? `Alpha ${signedPct(m.alpha)} a year` : 'No benchmark data'} />
        </div>
      </StaggerItem>

      <StaggerItem className="mt-6">
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.slice(0, 3).map((i) => (
            <InsightBlock key={i.title} tone={i.tone} title={i.title} body={i.body} />
          ))}
        </div>
      </StaggerItem>

      <StaggerItem className="mt-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <SectionTitle title="Where your risk comes from" subtitle="Share of money vs share of portfolio variance (Euler risk decomposition)" />
            <ul className="mt-5 space-y-3">
              {[...report.assets].sort((x, y) => y.riskShare - x.riskShare).map((a) => (
                <li key={a.instrumentId}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-foreground" title={a.name}>
                      {a.symbol}
                      {a.proxy && a.proxy !== 'accrual' && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">via {a.proxy}</span>}
                    </span>
                    <span className="tnum text-xs text-muted-foreground">
                      {pct(a.weight, 0)} of money · <span className={cn('font-medium', a.riskShare > a.weight * 1.25 ? 'text-danger' : 'text-foreground')}>{pct(a.riskShare, 0)} of risk</span>
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--chart-5)]" style={{ width: `${a.weight * 100}%` }} /></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${Math.max(0, a.riskShare) * 100}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-[var(--chart-5)]" />Money</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-[var(--chart-2)]" />Risk</span>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="How deep the dips went" subtitle={`Distance below the previous peak. Worst day ${signedPct(m.worstDay.return)} (${dayLabel(m.worstDay.date)}); best ${signedPct(m.bestDay.return)}.`} />
            <div className="mt-4">
              <DrawdownChart data={m.underwater} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
              <MiniStat label="1-day VaR 95%" value={pct(m.var95Daily)} />
              <MiniStat label="Sortino" value={m.sortino.toFixed(2)} />
              <MiniStat label="Tracking error" value={m.trackingError != null ? pct(m.trackingError) : '—'} />
            </dl>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <Card className="p-6">
          <SectionTitle
            title="Portfolio optimiser"
            subtitle="Markowitz mean-variance optimisation over your own holdings, long-only with a cap per holding. Every point on the blue curve is the most return available for its level of risk."
          />
          <div className="mt-6">
            <OptimizerPanel report={report} />
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <Card className="p-6">
          <SectionTitle title="Crash test" subtitle="What a market shock would do to these exact holdings, today." />
          <div className="mt-6">
            <StressPanel report={report} />
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <Card className="p-6">
          <SectionTitle title="What moves together" subtitle="Correlation of daily returns. Low or negative numbers are what make diversification work." />
          <div className="mt-6">
            <CorrelationHeatmap labels={report.assets.map((a) => a.symbol)} matrix={report.correlation} />
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <details className="group rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">How these numbers are calculated</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Data: {m.observations} trading days of official NSE closing prices (bhavcopy) and AMFI NAVs, adjusted for bonuses and splits.
              {report.assets.some((a) => a.proxy === 'GOLDBEES') && ' Sovereign Gold Bonds use Nippon India Gold BeES as their daily price proxy.'}
            </li>
            <li>Volatility, VaR and drawdown use simple daily returns, annualised over 252 trading days. VaR is historical (empirical 5th percentile); the parametric 1-month VaR is {pct(m.parametricVar95Monthly)}.</li>
            <li>Risk contributions use the Euler decomposition w·(Σw)ᵢ / w′Σw of the sample covariance matrix.</li>
            <li>
              The optimiser uses a Ledoit–Wolf shrunk covariance (shrinkage {report.optimizer.shrinkage.toFixed(3)}) and expected returns that weight history at{' '}
              {Math.round(report.optimizer.historyWeight * 100)}% against long-run asset-class returns, solved by accelerated projected gradient ascent.
            </li>
            <li>Sharpe, Sortino and alpha use a {pct(report.riskFree, 0)} risk-free rate. Beta and alpha are measured against the Nifty 50 (Nippon India Nifty BeES).</li>
            {report.excluded.length > 0 && (
              <li>Left out for lack of history: {report.excluded.map((e) => `${e.symbol} (${formatINRCompact(e.value)})`).join(', ')}.</li>
            )}
          </ul>
          <p className="mt-3">
            Want this explained? <Link href="/mentor" className="font-medium text-primary hover:underline">Ask the AI Copilot</Link> &mdash; it can run the same models.
          </p>
        </details>
      </StaggerItem>
    </StaggerContainer>
  );
}

function Kpi({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn('font-serif text-2xl tnum tracking-tight', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-foreground')}>{value}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </Card>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tnum text-foreground">{value}</dd>
    </div>
  );
}
