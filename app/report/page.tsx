import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { getRiskReport } from '@/lib/db/risk';
import { getTaxCentreData } from '@/lib/db/tax';
import { classifyPosition, computeTax, lossHarvest, ltcgHarvestPlan, TAX_RULES } from '@/lib/math/tax';
import { formatINR, formatINRCompact } from '@/lib/format';
import { PrintButton } from '@/components/report/print-button';

export const metadata = { title: 'Portfolio report — OmniScope' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d)}%`);
const frac = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const inr = (x: number | null | undefined) => (x == null ? '—' : formatINRCompact(Math.round(x)));
const day = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const PRINT_CSS = `
@page { size: A4; margin: 14mm 12mm; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .report { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
  .report section { break-inside: avoid; }
  .report .page-break { break-before: page; }
  a { color: inherit; text-decoration: none; }
}
.report table { width: 100%; border-collapse: collapse; font-size: 12px; }
.report th { text-align: left; font-weight: 500; color: var(--muted-foreground); border-bottom: 1px solid var(--border); padding: 6px 4px; }
.report td { border-bottom: 1px solid color-mix(in oklch, var(--border) 60%, transparent); padding: 6px 4px; font-variant-numeric: tabular-nums; }
.report .num { text-align: right; }
`;

export default async function ReportPage() {
  if (!isSupabaseConfigured()) redirect('/');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=%2Freport');

  const [snapshot, risk, tax] = await Promise.all([loadFinancialSnapshot(user.id), getRiskReport(user.id).catch(() => null), getTaxCentreData(user.id).catch(() => null)]);
  const s = snapshot.summary;
  const ps = s.portfolioSummary;
  const name = (s.profile?.user?.name as string | undefined) || (user.user_metadata?.full_name as string | undefined) || null;
  const priced = s.holdings.filter((h) => h.currentValue != null).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  const total = ps.totalCurrentValue ?? 0;

  const positions = tax ? tax.holdings.map((h) => classifyPosition(h, tax.asOf)) : [];
  const dated = positions.filter((p) => p.bucket);
  const taxOpts = { slabRate: tax?.defaultSlabRate ?? 0.2 };
  const taxNow = tax ? computeTax(dated, taxOpts) : null;
  const harvest = taxNow ? ltcgHarvestPlan(dated, TAX_RULES.ltcgExemption) : null;
  const losses = tax ? lossHarvest(dated, taxOpts) : [];

  const goals = s.goalsSummary.projections.map((p) => ({ p, sim: snapshot.goalSimulations.find((g) => g.goalId === p.goal.id)?.simulation ?? null }));
  const m = risk?.metrics;
  const hotspot = risk ? [...risk.assets].sort((a, b) => b.riskShare - b.weight - (a.riskShare - a.weight))[0] : null;

  const observations: string[] = [];
  if (ps.totalUnrealizedGain != null) observations.push(`Unrealised ${ps.totalUnrealizedGain >= 0 ? 'gain' : 'loss'} of ${inr(Math.abs(ps.totalUnrealizedGain))} (${pct(ps.totalUnrealizedGainPct)}) on ${inr(ps.pricedInvested)} invested in priced holdings.`);
  if (m && risk) observations.push(`Over the last two years the portfolio returned ${frac(m.annualReturn)} a year against ${frac(risk.benchmark.annualReturn)} for the Nifty 50, with ${frac(m.annualVolatility)} volatility and a worst fall of ${frac(m.maxDrawdown)}.`);
  if (hotspot && hotspot.riskShare > hotspot.weight * 1.25) observations.push(`${hotspot.symbol} is ${frac(hotspot.weight, 0)} of the money but ${frac(hotspot.riskShare, 0)} of the risk.`);
  if (m) observations.push(`In one month out of twenty, losses could exceed ${inr(m.var95Monthly * (risk?.analysedValue ?? 0))} (95% one-month Value-at-Risk).`);
  const behind = goals.filter((g) => g.sim && g.sim.nominal.probabilityOfSuccess < 0.5);
  if (behind.length) observations.push(`${behind.map((g) => g.p.goal.name).join(' and ')} ${behind.length === 1 ? 'has' : 'have'} less than an even chance of being reached on current savings.`);
  if (harvest && harvest.gainBooked > 0) observations.push(`${inr(harvest.gainBooked)} of long-term equity gains can be booked tax-free this financial year by selling and rebuying.`);
  if (snapshot.health.overallScore != null) observations.push(`Financial health score ${snapshot.health.overallScore}/100 (${snapshot.health.ratingLabel}).`);

  return (
    <div className="min-h-svh bg-muted/40 py-8 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to dashboard</Link>
        <PrintButton />
      </div>

      <article className="report mx-auto max-w-[210mm] rounded-xl border border-border bg-white p-[14mm] text-[13px] leading-relaxed text-foreground shadow-sm">
        <header className="flex items-start justify-between border-b border-border pb-5">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles className="size-3.5" /></span>
              OmniScope
            </p>
            <h1 className="mt-4 font-serif text-4xl tracking-tight">Portfolio report</h1>
            <p className="mt-1 text-muted-foreground">{name ? `Prepared for ${name.split(' ')[0]} · ` : ''}{day(new Date())}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Prices: official NSE closes and AMFI NAVs</p>
            {ps.latestPriceTimestamp && <p>Latest price {day(ps.latestPriceTimestamp)}</p>}
            {m && <p>Risk window {day(m.fromDate)} – {day(m.toDate)}</p>}
          </div>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-3">
          {[
            ['Market value', inr(total)],
            ['Invested', inr(ps.totalInvested)],
            ['Unrealised gain', `${inr(ps.totalUnrealizedGain)} (${pct(ps.totalUnrealizedGainPct)})`],
            ['XIRR', pct(snapshot.performance?.xirrPct)],
            ['Financial health', snapshot.health.overallScore != null ? `${snapshot.health.overallScore}/100` : '—'],
            ['Holdings', `${ps.holdingCount} in ${ps.accountCount} account${ps.accountCount === 1 ? '' : 's'}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-3">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="mt-0.5 font-serif text-xl">{v}</p>
            </div>
          ))}
        </section>

        <section className="mt-6">
          <h2 className="text-base font-semibold">Key observations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold">Holdings</h2>
          <table>
            <thead>
              <tr><th>Holding</th><th className="num">Units</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">Gain</th><th className="num">Weight</th></tr>
            </thead>
            <tbody>
              {priced.map((h) => (
                <tr key={h.id}>
                  <td><span className="font-medium">{h.symbol}</span> <span className="text-muted-foreground">{h.name.length > 34 ? `${h.name.slice(0, 34)}…` : h.name}</span></td>
                  <td className="num">{h.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                  <td className="num">{formatINR(h.averageAcquisitionCost)}</td>
                  <td className="num">{formatINR(h.currentPrice ?? 0)}</td>
                  <td className="num">{inr(h.currentValue)}</td>
                  <td className="num">{inr(h.unrealizedGain)}</td>
                  <td className="num">{total > 0 ? pct(((h.currentValue ?? 0) / total) * 100) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {snapshot.xray && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Allocation by asset class</h2>
            <div className="space-y-1.5">
              {snapshot.xray.assetClassAllocations.map((a) => (
                <div key={a.assetClass} className="grid grid-cols-[130px_1fr_90px] items-center gap-3 text-xs">
                  <span>{a.assetClass}</span>
                  <span className="h-2 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${a.verifiedWeightPct}%` }} /></span>
                  <span className="text-right tabular-nums">{pct(a.verifiedWeightPct)} · {inr(a.verifiedValue)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {m && risk && (
          <section className="page-break mt-6">
            <h2 className="mb-2 text-base font-semibold">Risk (last two years)</h2>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                ['Annual return', frac(m.annualReturn)],
                ['Volatility', frac(m.annualVolatility)],
                ['Sharpe ratio', m.sharpe.toFixed(2)],
                ['Worst fall', `−${frac(m.maxDrawdown)}`],
                ['Beta to Nifty', m.beta != null ? m.beta.toFixed(2) : '—'],
                ['Alpha', frac(m.alpha)],
                ['1-month VaR 95%', inr(m.var95Monthly * risk.analysedValue)],
                ['Nifty 50 return', frac(risk.benchmark.annualReturn)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">{k}</p>
                  <p className="font-medium tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <table className="mt-3">
              <thead><tr><th>Holding</th><th className="num">Share of money</th><th className="num">Share of risk</th><th className="num">Volatility</th><th className="num">Beta</th></tr></thead>
              <tbody>
                {[...risk.assets].sort((a, b) => b.riskShare - a.riskShare).map((a) => (
                  <tr key={a.instrumentId}>
                    <td className="font-medium">{a.symbol}</td>
                    <td className="num">{frac(a.weight)}</td>
                    <td className="num">{frac(a.riskShare)}</td>
                    <td className="num">{frac(a.annualVolatility)}</td>
                    <td className="num">{a.betaEquity.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {goals.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Goals</h2>
            <table>
              <thead><tr><th>Goal</th><th className="num">Target</th><th>Deadline</th><th className="num">Saved</th><th className="num">SIP / month</th><th className="num">Chance (Monte Carlo)</th></tr></thead>
              <tbody>
                {goals.map(({ p, sim }) => (
                  <tr key={p.goal.id}>
                    <td className="font-medium">{p.goal.name}</td>
                    <td className="num">{inr(p.details.targetAmount)}</td>
                    <td>{day(p.details.deadlineDate)}</td>
                    <td className="num">{inr(p.details.currentAllocatedAmount)}</td>
                    <td className="num">{inr(p.details.monthlyContribution)}</td>
                    <td className="num">{sim ? frac(sim.nominal.probabilityOfSuccess, 0) : p.details.isFunded ? 'Funded' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {taxNow && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Capital-gains tax ({tax?.financialYear})</h2>
            <p>
              Selling everything today would cost about <span className="font-semibold">{inr(taxNow.totalTax)}</span> in capital-gains tax (including cess, at a{' '}
              {Math.round(taxOpts.slabRate * 100)}% slab), after setting losses against gains. {harvest && harvest.gainBooked > 0 ? `${inr(harvest.gainBooked)} of long-term equity gains could be booked tax-free this year, saving about ${inr(harvest.futureTaxSaved)} later.` : ''}{' '}
              {losses.length ? `Unrealised losses of ${inr(losses.reduce((a, l) => a + l.loss, 0))} (${losses.map((l) => l.position.symbol).join(', ')}) could offset gains.` : ''}
            </p>
            {positions.some((p) => p.excludedReason === 'Purchase date needed') && <p className="mt-1 text-xs text-muted-foreground">Some holdings have no purchase date and are left out of this estimate.</p>}
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold">Financial health</h2>
          <table>
            <thead><tr><th>Pillar</th><th>Measure</th><th className="num">Score</th><th>Next step</th></tr></thead>
            <tbody>
              {snapshot.health.pillars.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.label}</td>
                  <td>{p.metricLabel}: {p.metricValue}</td>
                  <td className="num">{p.isAssessed ? p.score : '—'}</td>
                  <td className="text-muted-foreground">{p.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-8 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
          Generated by OmniScope from official NSE closing prices, AMFI NAVs and the figures you entered. Risk figures use two years of daily
          returns; goal odds use 10,000-path Monte Carlo; tax follows the rules in force since 23 July 2024 and excludes surcharge. This report
          is for education and planning, not investment or tax advice. OmniScope is not a SEBI-registered investment adviser.
        </footer>
      </article>
    </div>
  );
}
