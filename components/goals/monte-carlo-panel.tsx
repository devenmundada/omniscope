'use client';

import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dices } from 'lucide-react';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { GoalSimulation } from '@/lib/db/goal-simulation';

function tone(p: number) {
  if (p >= 0.75) return 'bg-success-muted text-emerald-800 dark:text-success';
  if (p >= 0.5) return 'bg-warning-muted text-amber-800 dark:text-warning';
  return 'bg-danger-muted text-red-800 dark:text-danger';
}

export function ProbabilityBadge({ probability }: { probability: number }) {
  return (
    <span
      title="Monte Carlo probability of reaching the target (10,000 simulated market paths)"
      className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tnum', tone(probability))}
    >
      {Math.round(probability * 100)}% likely
    </span>
  );
}

export function MonteCarloPanel({
  simulation,
  target,
  deadline,
}: {
  simulation: GoalSimulation;
  target: number;
  deadline: string;
}) {
  const { nominal } = simulation;
  const data = nominal.fan.map((f) => ({
    label: f.month === 0 ? 'Now' : f.month % 12 === 0 ? `Y${f.month / 12}` : `M${f.month}`,
    band: [Math.round(f.p10), Math.round(f.p90)] as [number, number],
    p50: Math.round(f.p50),
  }));
  const pct = Math.round(nominal.probabilityOfSuccess * 100);
  const realPct = Math.round(simulation.inflationAdjustedProbability * 100);
  const sourceLabel =
    simulation.assumptionSource === 'risk-model'
      ? 'from the Risk Lab model of your actual holdings (two years of prices, shrunk covariance)'
      : simulation.assumptionSource === 'portfolio-history'
      ? 'calibrated from your holdings’ actual price history'
      : simulation.assumptionSource === 'portfolio-defaults'
        ? 'based on your asset mix and long-run asset-class averages'
        : 'a balanced default (add holdings to personalise)';

  return (
    <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Dices className="size-3.5" /> Monte Carlo Simulation
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {nominal.paths.toLocaleString('en-IN')} simulated market paths to {deadline}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-3xl tnum leading-none text-foreground">{pct}%</p>
          <p className="text-[10px] text-muted-foreground">chance of reaching {formatINRCompact(target)}</p>
        </div>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={52}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickFormatter={(v) => formatINRCompact(v)}
            />
            <Tooltip
              formatter={(value, name) => {
                if (Array.isArray(value)) return [`${formatINRCompact(Number(value[0]))} – ${formatINRCompact(Number(value[1]))}`, '10th–90th percentile'];
                return [formatINRCompact(Number(value)), name === 'p50' ? 'Median path' : String(name)];
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="band" stroke="none" fill="var(--chart-1)" fillOpacity={0.18} />
            <Line type="monotone" dataKey="p50" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
            <ReferenceLine y={target} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: 'Target', fontSize: 10, fill: 'var(--destructive)', position: 'insideTopLeft' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-card p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Bad markets (P10)</p>
          <p className="font-serif text-sm tnum">{formatINRCompact(nominal.p10)}</p>
        </div>
        <div className="rounded-md bg-card p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Typical (P50)</p>
          <p className="font-serif text-sm tnum">{formatINRCompact(nominal.p50)}</p>
        </div>
        <div className="rounded-md bg-card p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Good markets (P90)</p>
          <p className="font-serif text-sm tnum">{formatINRCompact(nominal.p90)}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Assumes {(simulation.annualReturn * 100).toFixed(1)}% expected annual return and {(simulation.annualVolatility * 100).toFixed(1)}% volatility,{' '}
        {sourceLabel}. Against the inflation-adjusted target the probability is <span className="font-semibold text-foreground">{realPct}%</span>.
        These are simulations, not guarantees.
      </p>
    </div>
  );
}
