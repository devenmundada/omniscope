'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Crosshair, Mountain, Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import type { GoalOptimizerData } from '@/lib/db/goal-optimizer';
import { efficientFrontier, evaluate, rebalanceTrades } from '@/lib/math/optimizer';
import { goalPlan, goalProbability, sipForProbability } from '@/lib/math/goal-optimizer';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--danger)'];
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const inr = (x: number) => formatINRCompact(Math.round(x));
const FINAL_PATHS = 10000;

export function GoalOptimizerView({ data }: { data: GoalOptimizerData }) {
  const { mu, cov } = data.optimizer;
  const rf = data.riskFree;
  const [capPct, setCapPct] = useState(35);
  const [targetProb, setTargetProb] = useState(0.8);
  const [objective, setObjective] = useState<'average' | 'weakest'>('average');
  const cap = useDeferredValue(capPct) / 100;

  const current = useMemo(() => evaluate(data.assets.map((a) => a.weight), mu, cov, rf), [data.assets, mu, cov, rf]);
  const points = useMemo(() => {
    const f = efficientFrontier(mu, cov, rf, cap, 40);
    return [...f.points.filter((p) => Math.abs(p.volatility - f.maxSharpe.volatility) > 1e-4), f.maxSharpe].sort((a, b) => a.volatility - b.volatility);
  }, [mu, cov, rf, cap]);
  const plan = useMemo(() => goalPlan(data.goals, points, 1500), [data.goals, points]);

  // Final numbers with 10,000 paths and the Goals page's seeds.
  const details = useMemo(
    () =>
      data.goals.map((g, gi) => {
        const best = points[plan.curves[gi].bestIndex];
        const nowP = goalProbability(g, current, FINAL_PATHS);
        const bestP = goalProbability(g, best, FINAL_PATHS);
        return { goal: g, best, nowP, bestP, required: plan.curves[gi].requiredReturn, sip: sipForProbability(g, best, targetProb, 2000) };
      }),
    [data.goals, points, plan, current, targetProb]
  );
  const chosenIndex = objective === 'average' ? plan.average.bestIndex : plan.weakest.bestIndex;
  const chosen = points[chosenIndex];
  const chosenProbs = useMemo(() => data.goals.map((g) => goalProbability(g, chosen, FINAL_PATHS)), [data.goals, chosen]);
  const trades = rebalanceTrades(data.assets.map((a) => a.value), chosen.weights);

  const chart = points.map((p, i) => {
    const row: Record<string, number> = { vol: Math.round(p.volatility * 1000) / 10 };
    plan.curves.forEach((c) => (row[c.goalId] = Math.round(c.probabilities[i] * 1000) / 10));
    if (data.goals.length > 1) row.average = Math.round(plan.average.probabilities[i] * 1000) / 10;
    return row;
  });

  if (data.goals.length === 0) {
    return (
      <div>
        <Header />
        <Card className="max-w-xl p-6 text-sm text-muted-foreground">
          You have no open goals to optimise for{data.fundedGoals.length ? ` (${data.fundedGoals.join(', ')} already funded)` : ''}.{' '}
          <Link href="/goals" className="font-medium text-primary hover:underline">Add a goal</Link> with a target and deadline.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid gap-3 md:grid-cols-3">
        <Step icon={<Mountain className="size-4" />} title="Too little risk" body="A very safe mix may never grow fast enough to reach an ambitious target." />
        <Step icon={<Crosshair className="size-4" />} title="Too much risk" body="A very aggressive mix widens the range of outcomes, so a near deadline can land in a slump." />
        <Step icon={<Scale className="size-4" />} title="The sweet spot" body="For each goal, 10,000 simulated markets per mix find the risk level with the best odds of success." />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Chance of success at each level of risk</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Each line walks along your efficient frontier from the calmest mix to the most aggressive. Diamonds mark your current mix (which sits
              below the frontier); rings mark each goal&rsquo;s best point.
            </p>
          </div>
          <label className="text-xs text-muted-foreground">
            <span className="flex justify-between gap-6"><span>Most in any one holding</span><span className="tnum">{capPct}%</span></span>
            <input type="range" min={15} max={100} step={5} value={capPct} onChange={(e) => setCapPct(Number(e.target.value))} className="mt-2 w-48 accent-[var(--primary)]" />
          </label>
        </div>
        <div className="mt-4 h-[320px] w-full" role="img" aria-label="Probability of reaching each goal against portfolio risk">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="vol" domain={['dataMin', 'dataMax']} unit="%" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} label={{ value: 'Risk (annual volatility)', position: 'insideBottom', offset: -12, fill: 'var(--muted-foreground)', fontSize: 12 }} />
              <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(v) => `Risk ${v}%`} formatter={(v, name) => [`${v}%`, name === 'average' ? 'Average of goals' : data.goals.find((g) => g.id === name)?.name ?? String(name)]} />
              <Legend formatter={(v) => (v === 'average' ? 'Average of goals' : data.goals.find((g) => g.id === v)?.name ?? v)} wrapperStyle={{ fontSize: 12 }} />
              {data.goals.map((g, i) => (
                <Line key={g.id} type="monotone" dataKey={g.id} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              {data.goals.length > 1 && <Line type="monotone" dataKey="average" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              {details.map((d, i) => (
                <ReferenceDot key={`now-${d.goal.id}`} x={Math.round(current.volatility * 1000) / 10} y={Math.round(d.nowP * 1000) / 10} r={5} fill={COLORS[i % COLORS.length]} stroke="var(--background)" shape={(props: { cx?: number; cy?: number }) => <rect x={(props.cx ?? 0) - 5} y={(props.cy ?? 0) - 5} width={10} height={10} transform={`rotate(45 ${props.cx} ${props.cy})`} fill={COLORS[i % COLORS.length]} stroke="var(--background)" />} />
              ))}
              {details.map((d, i) => (
                <ReferenceDot key={`best-${d.goal.id}`} x={Math.round(d.best.volatility * 1000) / 10} y={Math.round(plan.curves[i].probabilities[plan.curves[i].bestIndex] * 1000) / 10} r={7} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {points[0].volatility > 0.08 && (
        <p className="rounded-xl border border-warning/40 bg-warning-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your calmest possible mix still swings about {pct(points[0].volatility)} a year.</span> Every
          holding is shares or gold, with no debt fund or deposit, so near goals cannot be de-risked further. Adding a short-term debt fund
          would extend the frontier to the left and give goals within a few years a safer option.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {details.map((d, i) => {
          const years = d.goal.months / 12;
          const gain = d.bestP - d.nowP;
          const calmer = d.best.volatility < current.volatility - 0.005;
          return (
            <Card key={d.goal.id} className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.goal.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {inr(d.goal.target)} by {new Date(d.goal.deadline).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · {years.toFixed(1)} years ·{' '}
                    {inr(d.goal.monthly)}/month · needs {d.required != null ? `${pct(d.required, 1)} a year` : 'more than 100% a year'}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Today&rsquo;s mix</p>
                  <p className="font-serif text-3xl tnum">{pct(d.nowP)}</p>
                  <p className="text-[11px] text-muted-foreground">{pct(current.expectedReturn, 1)} return · {pct(current.volatility, 1)} risk</p>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Best mix for this goal</p>
                  <p className={cn('font-serif text-3xl tnum', gain > 0.005 ? 'text-success' : 'text-foreground')}>{pct(d.bestP)}</p>
                  <p className="text-[11px] text-muted-foreground">{pct(d.best.expectedReturn, 1)} return · {pct(d.best.volatility, 1)} risk</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {gain > 0.005
                  ? `A ${calmer ? 'calmer' : 'more growth-oriented'} mix lifts the odds by ${Math.round(gain * 100)} points. `
                  : 'Your current risk level is already close to the best for this goal. '}
                {years < 7
                  ? 'With the deadline this close, avoiding a badly timed slump matters as much as growth.'
                  : 'With this much time, growth has room to compound and short-term falls matter less.'}
              </p>
              <p className="mt-2 text-sm">
                {d.sip == null ? (
                  <>Even a much larger SIP would not reach {pct(targetProb)} with these assumptions; consider a later deadline or a smaller target.</>
                ) : d.sip <= d.goal.monthly ? (
                  <>The best mix already gives at least a {pct(targetProb)} chance at your current SIP.</>
                ) : (
                  <>
                    For a {pct(targetProb)} chance with the best mix, invest <span className="font-semibold tnum">{inr(d.sip)}</span> a month (
                    <span className="tnum">{inr(d.sip - d.goal.monthly)}</span> more).
                  </>
                )}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">One mix for all your goals</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              You hold one portfolio, so this picks the single point on the frontier that serves your goals best together.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['average', 'weakest'] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setObjective(o)}
                className={cn('rounded-full border px-3 py-1.5 text-xs', objective === o ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-accent')}
              >
                {o === 'average' ? 'Highest average chance' : 'Protect the weakest goal'}
              </button>
            ))}
            <select value={targetProb} onChange={(e) => setTargetProb(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label="Target probability for the SIP suggestion">
              {[0.7, 0.8, 0.9].map((p) => (
                <option key={p} value={p}>SIP target {pct(p)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This mix: {pct(chosen.expectedReturn, 1)} expected return, {pct(chosen.volatility, 1)} risk (today: {pct(current.expectedReturn, 1)},{' '}
              {pct(current.volatility, 1)}).
            </p>
            {data.goals.map((g, i) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>{g.name}</span>
                <span className="tnum">
                  <span className="text-muted-foreground line-through decoration-border">{pct(details[i].nowP)}</span>{' '}
                  <span className={cn('font-semibold', chosenProbs[i] > details[i].nowP + 0.005 ? 'text-success' : chosenProbs[i] < details[i].nowP - 0.005 ? 'text-danger' : '')}>{pct(chosenProbs[i])}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Holding</th>
                  <th className="py-2 text-right font-medium">Now</th>
                  <th className="py-2 text-right font-medium">Target</th>
                  <th className="py-2 text-right font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {data.assets
                  .map((a, i) => ({ a, w: chosen.weights[i], t: trades.find((x) => x.index === i)?.amount ?? 0 }))
                  .sort((x, y) => y.w - x.w)
                  .map(({ a, w, t }) => (
                    <tr key={a.symbol} className="border-b border-border/60">
                      <td className="py-1.5 font-medium">{a.symbol}</td>
                      <td className="py-1.5 text-right tnum text-muted-foreground">{pct(a.weight)}</td>
                      <td className="py-1.5 text-right tnum font-medium">{pct(w)}</td>
                      <td className={cn('py-1.5 text-right tnum', t > 0 ? 'text-success' : t < 0 ? 'text-danger' : 'text-muted-foreground')}>{t === 0 ? '—' : `${t > 0 ? 'Buy' : 'Sell'} ${inr(Math.abs(t))}`}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <details className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How this works</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
          <li>The efficient frontier comes from the Risk Lab model: expected returns shrunk towards long-run asset-class returns and a Ledoit–Wolf covariance of your actual holdings, long-only with a cap per holding.</li>
          <li>For every frontier portfolio, each goal&rsquo;s current corpus and monthly SIP are compounded through monthly lognormal returns with that portfolio&rsquo;s expected return and volatility; success means reaching the target by the deadline. Curves use 1,500 paths; the figures in the cards use 10,000.</li>
          <li>Every portfolio is simulated with the same random paths (common random numbers), and with the same seeds as the Goals page, so &ldquo;today&rsquo;s mix&rdquo; matches it exactly.</li>
          <li>The approach follows goal-based investing (Das, Markowitz, Scheid and Statman, 2010): each goal is its own mental account with its own horizon and risk budget.</li>
          <li>Targets are nominal, as on the Goals page. Trades ignore tax and exit loads (see the Tax Centre). This is a model, not advice.</li>
        </ul>
      </details>
    </div>
  );
}

function Header() {
  return (
    <div>
      <Link href="/goals" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Goals
      </Link>
      <PageHeader
        eyebrow="Goal-based optimiser"
        title="Which mix gives your goals the best chance?"
        question="Not the highest return, but enough return, reliably, by each deadline: every portfolio on your efficient frontier is tested against every goal."
      />
    </div>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {title}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
