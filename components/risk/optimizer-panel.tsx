'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { efficientFrontier, evaluate, frontierAtVolatility, randomPortfolios, rebalanceTrades, type FrontierPoint } from '@/lib/math/optimizer';
import type { RiskReport } from '@/lib/db/risk';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pct, signedPct } from './risk-charts';

type Preset = 'minVariance' | 'maxSharpe' | 'sameRisk' | 'custom';

const presetLabels: Record<Exclude<Preset, 'custom'>, { title: string; body: string }> = {
  minVariance: { title: 'Lowest risk', body: 'The calmest mix these holdings can make.' },
  maxSharpe: { title: 'Best risk-adjusted', body: 'Most expected return for each unit of risk.' },
  sameRisk: { title: 'Same risk, more return', body: 'Your current risk level, used more efficiently.' },
};

export function OptimizerPanel({ report }: { report: RiskReport }) {
  const { mu, cov, riskFree } = report.optimizer;
  const labels = report.assets.map((a) => a.symbol);
  const values = report.assets.map((a) => a.value);
  const current = useMemo(() => evaluate(report.assets.map((a) => a.weight), mu, cov, riskFree), [report, mu, cov, riskFree]);

  const [capPct, setCapPct] = useState(35);
  const cap = useDeferredValue(capPct) / 100;
  const frontier = useMemo(() => efficientFrontier(mu, cov, riskFree, cap), [mu, cov, riskFree, cap]);
  const cloud = useMemo(() => randomPortfolios(mu, cov, riskFree, 1200), [mu, cov, riskFree]);

  // Frontier points with the maximum-Sharpe portfolio slotted in, ordered by risk.
  const path = useMemo(() => {
    const pts = [...frontier.points.filter((p) => Math.abs(p.volatility - frontier.maxSharpe.volatility) > 1e-4), frontier.maxSharpe];
    return pts.sort((a, b) => a.volatility - b.volatility);
  }, [frontier]);
  const sameRisk = useMemo(() => frontierAtVolatility(mu, cov, riskFree, cap, current.volatility), [mu, cov, riskFree, cap, current]);

  const [preset, setPreset] = useState<Preset>('maxSharpe');
  const [customIndex, setCustomIndex] = useState(0);
  const target: FrontierPoint =
    preset === 'minVariance' ? frontier.minVariance : preset === 'sameRisk' ? sameRisk : preset === 'custom' ? path[Math.min(customIndex, path.length - 1)] : frontier.maxSharpe;
  const trades = rebalanceTrades(values, target.weights);
  const turnover = trades.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const toChart = (p: { volatility: number; expectedReturn: number }) => ({ x: p.volatility * 100, y: p.expectedReturn * 100 });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="h-[340px] w-full" role="img" aria-label="Efficient frontier: expected return against risk for possible mixes of your holdings">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="Risk" unit="%" tickLine={false} axisLine={false} domain={['auto', 'auto']} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} label={{ value: 'Risk (annual volatility)', position: 'insideBottom', offset: -12, fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <YAxis type="number" dataKey="y" name="Expected return" unit="%" tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <ZAxis range={[14, 14]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [`${Number(v).toFixed(1)}%`, String(name)]}
                />
                <Scatter name="Random mixes" data={cloud.map(toChart)} fill="var(--chart-5)" fillOpacity={0.25} isAnimationActive={false} />
                <Scatter name="Efficient frontier" data={path.map(toChart)} fill="var(--chart-2)" line={{ stroke: 'var(--chart-2)', strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} />
                <Scatter name="Your portfolio" data={[toChart(current)]} fill="var(--danger)" shape="diamond" isAnimationActive={false}>
                </Scatter>
                <Scatter name="Target" data={[toChart(target)]} fill="var(--chart-1)" shape="star" isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--chart-5)] opacity-50" />1,200 random mixes</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--chart-2)]" />Efficient frontier</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-[var(--danger)]" />Your portfolio</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-[var(--chart-1)]">★</span>Selected target</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2">
            {(Object.keys(presetLabels) as Array<keyof typeof presetLabels>).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreset(k)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left transition-colors',
                  preset === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                )}
              >
                <p className="text-sm font-medium text-foreground">{presetLabels[k].title}</p>
                <p className="text-xs text-muted-foreground">{presetLabels[k].body}</p>
              </button>
            ))}
          </div>
          <label className="block">
            <span className="flex justify-between text-xs text-muted-foreground">
              <span>Walk along the frontier</span>
              <span>{preset === 'custom' ? `${pct(target.volatility)} risk` : 'drag to choose'}</span>
            </span>
            <input
              type="range"
              min={0}
              max={path.length - 1}
              value={
                preset === 'custom'
                  ? customIndex
                  : path.reduce((best, p, i) => (Math.abs(p.volatility - target.volatility) < Math.abs(path[best].volatility - target.volatility) ? i : best), 0)
              }
              onChange={(e) => {
                setPreset('custom');
                setCustomIndex(Number(e.target.value));
              }}
              className="mt-2 w-full accent-[var(--primary)]"
              aria-label="Position on the efficient frontier, from lowest risk to highest return"
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-xs text-muted-foreground">
              <span>Most in any one holding</span>
              <span className="tnum">{capPct}%</span>
            </span>
            <input type="range" min={15} max={100} step={5} value={capPct} onChange={(e) => setCapPct(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" aria-label="Maximum weight allowed in a single holding" />
          </label>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
            <Compare label="Expected return" now={current.expectedReturn} next={target.expectedReturn} />
            <Compare label="Risk" now={current.volatility} next={target.volatility} lowerIsBetter />
            <Compare label="Sharpe" now={current.sharpe} next={target.sharpe} raw />
          </div>
        </div>
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
            {report.assets
              .map((a, i) => ({ a, i, target: target.weights[i], trade: trades.find((t) => t.index === i)?.amount ?? 0 }))
              .sort((x, y) => y.target - x.target)
              .map(({ a, i, target: tw, trade }) => (
                <tr key={a.instrumentId} className="border-b border-border/60">
                  <td className="py-2">
                    <span className="font-medium text-foreground">{labels[i]}</span>
                    <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{a.name}</span>
                  </td>
                  <td className="py-2 text-right tnum text-muted-foreground">{pct(a.weight)}</td>
                  <td className="py-2 text-right tnum font-medium">{pct(tw)}</td>
                  <td className={cn('py-2 text-right tnum', trade > 0 ? 'text-success' : trade < 0 ? 'text-danger' : 'text-muted-foreground')}>
                    {trade === 0 ? '—' : `${trade > 0 ? 'Buy' : 'Sell'} ${formatINRCompact(Math.abs(trade))}`}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Moving to this mix means trading about {formatINRCompact(turnover)}. Selling can trigger capital-gains tax and exit loads, which this
          model ignores. Expected returns blend each holding&rsquo;s history ({Math.round(report.optimizer.historyWeight * 100)}% weight) with
          long-run asset-class returns, because two years of history alone would overrate whatever just rallied. This is a model, not advice.
        </p>
      </div>
    </div>
  );
}

function Compare({ label, now, next, lowerIsBetter, raw }: { label: string; now: number; next: number; lowerIsBetter?: boolean; raw?: boolean }) {
  const better = lowerIsBetter ? next < now - 1e-4 : next > now + 1e-4;
  const worse = lowerIsBetter ? next > now + 1e-4 : next < now - 1e-4;
  const fmt = (x: number) => (raw ? x.toFixed(2) : pct(x));
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs tnum text-muted-foreground line-through decoration-border">{fmt(now)}</p>
      <p className={cn('text-base font-semibold tnum', better ? 'text-success' : worse ? 'text-danger' : 'text-foreground')}>{fmt(next)}</p>
      {!raw && <p className="text-[11px] tnum text-muted-foreground">{signedPct(next - now)}</p>}
    </div>
  );
}
