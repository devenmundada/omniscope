'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BacktestReport } from '@/lib/db/backtest';
import { CopyMarkdown } from './copy-markdown';

const COLORS: Record<string, string> = {
  maxsharpe: 'var(--chart-1)',
  minvar: 'var(--chart-4)',
  current: 'var(--danger)',
  equal: 'var(--chart-3)',
  nifty: 'var(--chart-2)',
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function BacktestPanel({ report }: { report: BacktestReport }) {
  const ids = report.strategies.map((s) => s.id);
  const data = report.strategies[0].curve.map((p, i) => {
    const row: Record<string, number | string> = { date: p.date };
    for (const s of report.strategies) row[s.id] = s.curve[i]?.value ?? NaN;
    return row;
  });
  const sorted = [...report.strategies].sort((a, b) => b.sharpe - a.sharpe);
  const markdown = [
    `Walk-forward backtest, ${dateLabel(report.from)} to ${dateLabel(report.to)} (${report.years.toFixed(1)} years, ${report.rebalances} monthly rebalances, ${(report.costRate * 100).toFixed(1)}% one-way cost, 1-year training window)`,
    '',
    '| Strategy | CAGR | Volatility | Sharpe | Max drawdown | Turnover / yr | Growth of ₹1 |',
    '|---|---|---|---|---|---|---|',
    ...sorted.map((s) => `| ${s.name} | ${pct(s.cagr)} | ${pct(s.volatility)} | ${s.sharpe.toFixed(2)} | ${pct(s.maxDrawdown)} | ${s.annualTurnover.toFixed(2)} | ${s.finalValue.toFixed(2)} |`),
  ].join('\n');

  return (
    <div className="space-y-5">
      <div className="h-[320px] w-full" role="img" aria-label="Growth of one rupee under each strategy during the out-of-sample test period">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={monthLabel} tickLine={false} axisLine={false} minTickGap={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dy={8} />
            <YAxis tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v) => `₹${Number(v).toFixed(1)}`} />
            <Tooltip
              contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => dateLabel(String(v))}
              formatter={(v, name) => [`₹${Number(v).toFixed(3)}`, report.strategies.find((s) => s.id === name)?.name ?? String(name)]}
            />
            <Legend formatter={(v) => report.strategies.find((s) => s.id === v)?.name ?? v} wrapperStyle={{ fontSize: 12 }} />
            {ids.map((id) => (
              <Line key={id} type="monotone" dataKey={id} stroke={COLORS[id] ?? 'var(--chart-5)'} strokeWidth={id === 'maxsharpe' ? 2.5 : 1.5} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Strategy</th>
              <th className="py-2 text-right font-medium">CAGR</th>
              <th className="py-2 text-right font-medium">Volatility</th>
              <th className="py-2 text-right font-medium">Sharpe</th>
              <th className="py-2 text-right font-medium">Max drawdown</th>
              <th className="py-2 text-right font-medium">Turnover / yr</th>
              <th className="py-2 text-right font-medium">₹1 became</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="border-b border-border/60">
                <td className="py-2">
                  <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: COLORS[s.id] }} />
                  <span className="font-medium">{s.name}</span>
                  <span className="block pl-[18px] text-xs text-muted-foreground">{s.description}</span>
                </td>
                <td className="py-2 text-right tnum">{pct(s.cagr)}</td>
                <td className="py-2 text-right tnum">{pct(s.volatility)}</td>
                <td className="py-2 text-right tnum font-medium">{s.sharpe.toFixed(2)}</td>
                <td className="py-2 text-right tnum">{pct(s.maxDrawdown)}</td>
                <td className="py-2 text-right tnum">{s.annualTurnover.toFixed(2)}</td>
                <td className="py-2 text-right tnum">₹{s.finalValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Out-of-sample from {dateLabel(report.from)} to {dateLabel(report.to)}: at each of {report.rebalances} monthly rebalances every
          strategy saw only the previous {report.trainDays} trading days, then held its weights (letting them drift) for {report.rebalanceDays}{' '}
          days, paying {(report.costRate * 100).toFixed(1)}% on every rupee traded. Holdings: {report.holdings.join(', ')}. The test period
          includes a strong gold rally, which flatters any rule allowed to hold more gold; the two gold holdings share one price history, so
          the 35% cap allows up to 70% in gold. Past performance does not predict future results.
        </p>
        <CopyMarkdown markdown={markdown} />
      </div>
    </div>
  );
}
