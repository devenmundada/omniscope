'use client';

import { useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Play } from 'lucide-react';
import { runStudy, type StudySummary, type StudyTrial } from '@/lib/eval/rebalance-study';
import { formatINRCompact } from '@/lib/format';
import { CopyMarkdown } from './copy-markdown';

const inr = (x: number) => formatINRCompact(Math.round(x));

export function RebalanceStudyPanel() {
  const [result, setResult] = useState<{ trials: StudyTrial[]; summary: StudySummary; ms: number } | null>(null);
  const run = () => {
    const t0 = performance.now();
    const r = runStudy(200, 1);
    setResult({ ...r, ms: performance.now() - t0 });
  };

  if (!result) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={run} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Play className="size-4" aria-hidden /> Run 200 simulated portfolios
        </button>
        <p className="text-xs text-muted-foreground">Runs in your browser in well under a second. Fixed seeds: every run gives the same numbers.</p>
      </div>
    );
  }

  const s = result.summary;
  const rows: Array<[string, string]> = [
    ['Portfolios simulated', String(s.trials)],
    ['Tax-smart no more costly than oldest-first (90% of gap closed)', `${Math.round(s.smartNoWorse90 * 100)}%`],
    ['Median tax saved at 90% of gap closed', `${s.medianTaxSaved90Pct.toFixed(0)}%`],
    ['Mean tax saved at 90% of gap closed', `${s.meanTaxSaved90Pct.toFixed(0)}%`],
    ['Total tax, 90% of gap closed: tax-smart vs oldest-first', `${inr(s.totalTaxSmart90)} vs ${inr(s.totalTaxNaive90)}`],
    ['Total tax, full rebalance: tax-smart vs oldest-first', `${inr(s.totalTaxSmartFull)} vs ${inr(s.totalTaxNaiveFull)}`],
    ['Portfolios where the 90% plan pays no tax at all', `${s.zeroTaxSmart90} of ${s.trials}`],
    ['When tax-smart cost more, median extra cost', s.smartNoWorse90 < 1 ? inr(s.worseMedianExtra) : '—'],
  ];
  const md = ['| Measure | Result |', '|---|---|', ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join('\n');
  const points = result.trials.map((t) => ({ x: Math.round(t.naive90.tax), y: Math.round(t.smart90.tax), seed: t.seed }));
  const max = Math.max(1, ...points.map((p) => Math.max(p.x, p.y)));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([a, b]) => (
              <tr key={a} className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">{a}</td>
                <td className="py-2 text-right font-medium tnum">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Computed in {Math.round(result.ms)} ms.</p>
          <CopyMarkdown markdown={md} />
        </div>
      </div>
      <div>
        <div className="h-[280px]" role="img" aria-label="Scatter of tax paid by the tax-smart plan against the oldest-first plan for each simulated portfolio">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 22, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" domain={[0, max]} tickFormatter={(v) => inr(Number(v))} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} label={{ value: 'Oldest-first tax', position: 'insideBottom', offset: -14, fill: 'var(--muted-foreground)', fontSize: 12 }} />
              <YAxis type="number" dataKey="y" domain={[0, max]} tickFormatter={(v) => inr(Number(v))} width={56} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <ZAxis range={[18, 18]} />
              <Tooltip
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v, name) => [inr(Number(v)), name === 'x' ? 'Oldest-first' : 'Tax-smart']}
              />
              <Scatter name="Parity" data={[{ x: 0, y: 0 }, { x: max, y: max }]} line={{ stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' }} shape={() => <g />} isAnimationActive={false} />
              <Scatter name="Portfolios" data={points} fill="var(--chart-1)" fillOpacity={0.7} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Each dot is one portfolio, both plans closing 90% of the gap to the same target. Dots below the dashed line paid less tax with the tax-smart plan.
        </p>
      </div>
    </div>
  );
}
