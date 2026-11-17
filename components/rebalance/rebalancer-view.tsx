'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Hourglass, Lock, LockOpen, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { naiveCostAt, rebalancePath, rebalancePlan } from '@/lib/math/rebalance';
import { TARGET_LABELS, rebalanceInput, targetWeights, type RebalanceData, type RebalanceTarget } from '@/lib/math/rebalance-plan';
import { evaluate } from '@/lib/math/optimizer';
import { BUCKET_LABELS } from '@/lib/math/tax';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

const inr = (x: number) => formatINRCompact(Math.round(x));
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CASH_PRESETS = [0, 25_000, 50_000, 100_000];

const TARGET_HELP: Record<RebalanceTarget, string> = {
  maxSharpe: 'Most expected return for each unit of risk.',
  minVariance: 'The calmest mix these holdings can make.',
  sameRisk: 'Your current risk level, used more efficiently.',
};

function thin<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = Math.ceil(xs.length / max);
  return xs.filter((_, i) => i % step === 0 || i === xs.length - 1);
}

export function RebalancerView({ data, initialTarget }: { data: RebalanceData; initialTarget: RebalanceTarget }) {
  const [target, setTarget] = useState<RebalanceTarget>(initialTarget);
  const [cashInput, setCashInput] = useState(0);
  const cash = useDeferredValue(cashInput);
  // Gold bonds are tax-free if held to maturity and deposits carry break penalties, so start them locked.
  const [locked, setLocked] = useState<boolean[]>(() => data.assets.map((a) => a.category === 'sgb' || a.category === 'deposit'));
  const lockedDeferred = useDeferredValue(locked);

  const weights = useMemo(() => targetWeights(data, target), [data, target]);
  const input = useMemo(() => rebalanceInput(data, weights, cash, lockedDeferred), [data, weights, cash, lockedDeferred]);
  const result = useMemo(() => rebalancePath(input), [input]);

  // A chosen step only applies to the path it was chosen on; any change of inputs returns to the recommendation.
  const [choice, setChoice] = useState<{ result: typeof result; step: number } | null>(null);
  const chosen = choice?.result === result ? choice.step : null;
  const setChosen = (s: number | null) => setChoice(s == null ? null : { result, step: s });
  const step = chosen ?? result.recommendedStep;
  const plan = useMemo(() => rebalancePlan(input, result, step), [input, result, step]);
  const full = useMemo(() => rebalancePlan(input, result, result.moves.length), [input, result]);
  const naiveSame = naiveCostAt(result, plan.te);
  const naiveFull = result.naive[result.naive.length - 1];
  const saved = naiveSame ? naiveSame.cost - (plan.extraTax + plan.tradingCost) : null;

  const { mu, cov, riskFree } = data.optimizer;
  const now = evaluate(data.assets.map((a) => a.weight), mu, cov, riskFree);
  const after = evaluate(plan.weights, mu, cov, riskFree);
  const goal = evaluate(weights, mu, cov, riskFree);

  const smartPts = thin(result.smart, 90).map((p) => ({ x: p.cost, y: p.te * 100, step: p.step }));
  const naivePts = result.naive.map((p) => ({ x: p.cost, y: p.te * 100 }));
  const here = result.smart[plan.step];

  return (
    <div>
      <PageHeader
        eyebrow="Tax-smart Rebalancer"
        title="Fix your mix without a needless tax bill."
        question="The optimiser tells you where to go. This works out the cheapest way to get there: new money first, losses and tax-free gains next, the right account to sell from, and short-term gains last."
      />

      <StaggerContainer className="space-y-6">
        <StaggerItem>
          <Card className="grid gap-6 p-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">1. Where do you want to go?</p>
              <div role="radiogroup" aria-label="Target mix" className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(TARGET_LABELS) as RebalanceTarget[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={target === k}
                    onClick={() => setTarget(k)}
                    className={cn('rounded-xl border px-3 py-2.5 text-left transition-colors', target === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}
                  >
                    <p className="text-sm font-medium text-foreground">{TARGET_LABELS[k]}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{TARGET_HELP[k]}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Target: expected return {pct(goal.expectedReturn)}, risk {pct(goal.volatility)}, versus {pct(now.expectedReturn)} and {pct(now.volatility)} today. At
                most 35% in any one holding, as in the{' '}
                <Link href="/risk" className="text-primary hover:underline">Risk Lab</Link>.
              </p>
            </div>
            <div className="space-y-3">
              <label htmlFor="new-cash" className="block text-sm font-medium text-foreground">2. New money to invest now (optional)</label>
              <div className="flex flex-wrap items-center gap-2">
                {CASH_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={cashInput === c}
                    onClick={() => setCashInput(c)}
                    className={cn('rounded-full border px-3 py-1 text-xs tnum', cashInput === c ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-accent')}
                  >
                    {c === 0 ? 'None' : inr(c)}
                  </button>
                ))}
                <input
                  id="new-cash"
                  type="number"
                  min={0}
                  step={1000}
                  value={cashInput}
                  onChange={(e) => setCashInput(Math.max(0, Math.min(1e8, Number(e.target.value) || 0)))}
                  className="h-8 w-32 rounded-md border border-border bg-background px-2 text-sm tnum"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Money you were going to invest anyway (a bonus, this month&rsquo;s SIP) can close the gap with no tax at all, so it is used first.
              </p>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Gap to the target today" value={pct(result.te0, 2)} note="Active risk: how far your returns could stray from the target mix's in a typical year." />
            <Stat
              label="This plan closes"
              value={pct(plan.captured, 0)}
              note={`of the gap, for ${inr(plan.extraTax)} tax and ${inr(plan.tradingCost)} trading costs.`}
              tone="primary"
            />
            <Stat
              label="Saved versus oldest-first selling"
              value={saved != null ? inr(Math.max(0, saved)) : '—'}
              note={
                naiveSame
                  ? `Selling the same way most brokers do, to get equally close, would cost ${inr(naiveSame.cost)}.`
                  : 'With these locks, the naive plan cannot get this close to the target at all.'
              }
              tone={saved != null && saved > 1 ? 'success' : undefined}
            />
            <Stat
              label="Going all the way"
              value={inr(full.extraTax + full.tradingCost)}
              note={`Tax-smart full rebalance (tax ${inr(full.extraTax)}). Oldest-first: ${inr(naiveFull.cost)} (tax ${inr(naiveFull.tax)}).`}
            />
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card className="p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-foreground">Cost against closeness to the target</h2>
                <p className="text-xs text-muted-foreground">Each point is a plan. Lower is closer to the target; further left is cheaper.</p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--chart-1)]" />Tax-smart path</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--chart-5)]" />Oldest-first, part of the way</span>
                <span className="inline-flex items-center gap-1.5"><span className="text-[var(--danger)]">●</span>Selected plan</span>
              </div>
            </div>
            <div className="mt-4 h-[300px]" role="img" aria-label="Chart of plan cost against remaining gap to the target for the tax-smart path and the oldest-first path">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="Cost" tickFormatter={(v) => inr(Number(v))} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} label={{ value: 'Tax + trading costs', position: 'insideBottom', offset: -14, fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <YAxis type="number" dataKey="y" name="Gap" unit="%" width={48} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <ZAxis range={[16, 16]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => (name === 'Cost' ? [inr(Number(v)), 'Cost'] : [`${Number(v).toFixed(2)}%`, 'Gap to target'])}
                  />
                  <Scatter name="Oldest-first" data={naivePts} fill="var(--chart-5)" line={{ stroke: 'var(--chart-5)', strokeWidth: 2, strokeDasharray: '5 4' }} shape={() => <g />} isAnimationActive={false} />
                  <Scatter name="Tax-smart" data={smartPts} fill="var(--chart-1)" line={{ stroke: 'var(--chart-1)', strokeWidth: 2.5 }} shape={() => <g />} isAnimationActive={false} />
                  {here && <Scatter name="Selected" data={[{ x: here.cost, y: here.te * 100 }]} fill="var(--danger)" isAnimationActive={false} />}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <label className="mt-4 block">
              <span className="flex justify-between text-xs text-muted-foreground">
                <span>How far to go</span>
                <span className="tnum">
                  {pct(plan.captured, 0)} of the gap closed · {inr(plan.extraTax + plan.tradingCost)}
                  {step === result.recommendedStep && ' · recommended'}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={result.moves.length}
                value={step}
                onChange={(e) => setChosen(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--primary)]"
                aria-label="Position along the tax-smart path, from no trades to the full rebalance"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Recommended: the first plan that closes 90% of what is reachable. The last 10% usually costs the most for the least benefit.
              {chosen != null && chosen !== result.recommendedStep && (
                <>
                  {' '}
                  <button type="button" className="text-primary hover:underline" onClick={() => setChosen(null)}>Back to the recommendation</button>
                </>
              )}
            </p>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="overflow-x-auto p-6">
            <h2 className="text-base font-medium text-foreground">The trades</h2>
            <p className="text-xs text-muted-foreground">
              After these trades: expected return {pct(after.expectedReturn)} (from {pct(now.expectedReturn)}), risk {pct(after.volatility)} (from {pct(now.volatility)}).
              Lock a holding to keep it out of every sale.
            </p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Holding</th>
                  <th className="py-2 text-right font-medium">Now</th>
                  <th className="py-2 text-right font-medium">After</th>
                  <th className="py-2 text-right font-medium">Target</th>
                  <th className="py-2 text-right font-medium">Trade</th>
                  <th className="py-2 pl-4 text-right font-medium">Sell?</th>
                </tr>
              </thead>
              <tbody>
                {data.assets
                  .map((a, i) => ({ a, i }))
                  .sort((x, y) => weights[y.i] - weights[x.i])
                  .map(({ a, i }) => {
                    const t = plan.trades[i];
                    return (
                      <tr key={a.symbol} className="border-b border-border/60">
                        <td className="py-2">
                          <span className="font-medium text-foreground">{a.symbol}</span>
                          <span className="ml-2 hidden text-xs text-muted-foreground md:inline">{a.name}</span>
                        </td>
                        <td className="py-2 text-right tnum text-muted-foreground">{pct(a.value / result.total)}</td>
                        <td className="py-2 text-right tnum font-medium">{pct(plan.weights[i])}</td>
                        <td className="py-2 text-right tnum text-muted-foreground">{pct(weights[i])}</td>
                        <td className={cn('py-2 text-right tnum', t > 50 ? 'text-success' : t < -50 ? 'text-danger' : 'text-muted-foreground')}>
                          {Math.abs(t) <= 50 ? '—' : `${t > 0 ? 'Buy' : 'Sell'} ${inr(Math.abs(t))}`}
                        </td>
                        <td className="py-2 pl-4 text-right">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!locked[i]}
                            aria-label={`${locked[i] ? 'Allow selling' : 'Never sell'} ${a.symbol}`}
                            onClick={() => setLocked((l) => l.map((v, j) => (j === i ? !v : v)))}
                            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', locked[i] ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-border text-muted-foreground hover:bg-accent')}
                          >
                            {locked[i] ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                            {locked[i] ? 'Locked' : 'Allowed'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {data.assets.some((a) => a.category === 'sgb') && (
              <p className="mt-3 text-xs text-muted-foreground">
                Sovereign Gold Bonds start locked: held to maturity (or redeemed early with the RBI after five years) their gain is tax-free, but a sale on the exchange is taxed.
              </p>
            )}
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card className="overflow-x-auto p-6">
              <h2 className="text-base font-medium text-foreground">Which units to sell</h2>
              <p className="text-xs text-muted-foreground">Oldest units first inside each account (the FIFO rule for demat holdings); the account is chosen to minimise tax.</p>
              {plan.sales.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No sales needed: this plan only invests new money.</p>
              ) : (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Holding</th>
                      <th className="py-2 font-medium">Account</th>
                      <th className="py-2 font-medium">Bought</th>
                      <th className="py-2 text-right font-medium">Units</th>
                      <th className="py-2 text-right font-medium">Sale value</th>
                      <th className="py-2 text-right font-medium">Gain</th>
                      <th className="py-2 pl-3 font-medium">Taxed as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.sales.map((s, k) => (
                      <tr key={`${s.symbol}-${s.account}-${s.purchaseDate}-${k}`} className="border-b border-border/60">
                        <td className="py-2 font-medium text-foreground">{s.symbol}</td>
                        <td className="py-2 text-muted-foreground">{s.account}</td>
                        <td className="py-2 text-muted-foreground">{s.purchaseDate ? dateLabel(s.purchaseDate) : 'Unknown'}</td>
                        <td className="py-2 text-right tnum">{s.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                        <td className="py-2 text-right tnum">{inr(s.saleValue)}</td>
                        <td className={cn('py-2 text-right tnum', s.gain >= 0 ? 'text-success' : 'text-danger')}>{inr(s.gain)}</td>
                        <td className="py-2 pl-3 text-xs text-muted-foreground">
                          {s.bucket ? (s.gain < 0 ? `${s.term === 'long' ? 'Long' : 'Short'}-term loss` : BUCKET_LABELS[s.bucket]) : 'Not a capital gain'}
                          {s.assumedDate && ' (date unknown: assumed short-term)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="flex items-center gap-2 text-base font-medium text-foreground"><Scale className="size-4 text-primary" /> Tax on this plan</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {(Object.keys(plan.tax.taxable) as Array<keyof typeof plan.tax.taxable>).filter((b) => plan.tax.tax[b] > 0.5).map((b) => (
                    <div key={b} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{BUCKET_LABELS[b]}</dt>
                      <dd className="tnum">{inr(plan.tax.tax[b])}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Long-term exemption used</dt>
                    <dd className="tnum">{inr(plan.tax.exemptionUsed)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
                    <dt>Extra tax this year (incl. 4% cess)</dt>
                    <dd className="tnum">{inr(plan.extraTax)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  On top of {data.booked.length ? 'gains you have already booked' : 'nothing booked so far'} in {data.financialYear}. Slab rate {pct(data.slabRate, 0)} ({data.slabSource === 'profile' ? 'from your profile' : 'assumed'}).
                </p>
              </Card>
              {plan.waits.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5 p-6">
                  <h2 className="flex items-center gap-2 text-base font-medium text-foreground"><Hourglass className="size-4 text-amber-600" /> Worth waiting for</h2>
                  <ul className="mt-2 space-y-2 text-sm">
                    {plan.waits.map((w) => (
                      <li key={`${w.symbol}-${w.account}-${w.longTermOn}`}>
                        <span className="font-medium">{w.symbol}</span> ({w.account}) turns long-term on {dateLabel(w.longTermOn)}, in {w.days} days. Selling after that saves about{' '}
                        <span className="font-medium tnum">{inr(w.saving)}</span>.
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card className="p-6 text-xs leading-relaxed text-muted-foreground">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="size-4 text-primary" /> How this works</p>
                <p className="mt-2">
                  Each step moves a small amount of money from an overweight holding to the one where it closes the gap most, choosing whichever sale buys the
                  most risk reduction per rupee of tax and charges (0.1% a side). The gap is measured with the same covariance as the optimiser, so a
                  shortfall in one Nifty fund is partly covered by another.
                </p>
                <p className="mt-2">
                  Not modelled: exit loads (often 1% on equity funds redeemed within a year), STT and surcharge. This is an estimate for learning, not tax or investment advice.{' '}
                  <Link href="/methodology#rebalancer" className="text-primary hover:underline">Method</Link>
                </p>
              </Card>
            </div>
          </div>
        </StaggerItem>

        {data.excluded.length > 0 && (
          <StaggerItem>
            <p className="text-xs text-muted-foreground">
              Left out (not enough price history for the risk model): {data.excluded.map((e) => e.symbol).join(', ')}.
            </p>
          </StaggerItem>
        )}

        <StaggerItem>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/tax" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 hover:bg-accent">See the full Tax Centre</Link>
            <Link href="/mentor" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 hover:bg-accent">
              <Sparkles className="size-3.5" /> Ask the Copilot about this plan
            </Link>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'primary' | 'success' }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-serif text-3xl tnum', tone === 'primary' ? 'text-primary' : tone === 'success' ? 'text-success' : 'text-foreground')}>{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{note}</p>
    </Card>
  );
}
