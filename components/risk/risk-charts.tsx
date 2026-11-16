'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DrawdownPoint } from '@/lib/math/risk';
import { cn } from '@/lib/utils';

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const signedPct = (x: number, digits = 1) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Underwater" chart: how far the portfolio sat below its previous peak on each day. */
export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  return (
    <div className="h-[220px] w-full" role="img" aria-label="Portfolio drawdown from its previous peak over the last two years">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={monthLabel} tickLine={false} axisLine={false} minTickGap={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dy={8} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v) => pct(Number(v), 0)} domain={['dataMin', 0]} />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => dayLabel(String(v))}
            formatter={(v) => [pct(Number(v)), 'Below previous peak']}
          />
          <Area type="monotone" dataKey="drawdown" stroke="var(--danger)" strokeWidth={1.5} fill="url(#dd-fill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Correlation heatmap: green for assets that move together, blue for ones that offset each other. */
export function CorrelationHeatmap({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const n = labels.length;
  const colour = (c: number) =>
    c >= 0
      ? `color-mix(in oklch, var(--chart-1) ${Math.round(Math.min(1, c) * 85)}%, transparent)`
      : `color-mix(in oklch, var(--chart-2) ${Math.round(Math.min(1, -c) * 85)}%, transparent)`;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[11px]" aria-label="Correlation of daily returns between holdings">
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th key={l} scope="col" className="h-20 w-10 align-bottom font-medium text-muted-foreground">
                <span className="inline-block origin-bottom-left translate-x-3 -rotate-45 whitespace-nowrap">{l}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="pr-2 text-right font-medium text-muted-foreground whitespace-nowrap">{labels[i]}</th>
              {row.map((c, j) => (
                <td
                  key={j}
                  title={`${labels[i]} vs ${labels[j]}: ${c.toFixed(2)}`}
                  className={cn('size-10 rounded-md text-center tnum', i === j ? 'text-muted-foreground' : 'text-foreground')}
                  style={{ background: i === j ? 'var(--muted)' : colour(c) }}
                >
                  {n <= 14 ? c.toFixed(2) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: colour(-0.6) }} />Offset each other</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: colour(0.2) }} />Loosely linked</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: colour(0.9) }} />Move together</span>
      </div>
    </div>
  );
}
