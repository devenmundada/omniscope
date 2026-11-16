'use client';

import { useMemo, useState } from 'react';
import { HISTORICAL_SCENARIOS, stressTest, type ScenarioShock } from '@/lib/math/optimizer';
import { evaluate } from '@/lib/math/optimizer';
import type { RiskReport } from '@/lib/db/risk';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pct, signedPct } from './risk-charts';

export function StressPanel({ report }: { report: RiskReport }) {
  const [scenarioId, setScenarioId] = useState<string>('covid');
  const [shock, setShock] = useState<ScenarioShock>(HISTORICAL_SCENARIOS[1].shock);
  const scenario = HISTORICAL_SCENARIOS.find((s) => s.id === scenarioId);

  const expected = useMemo(
    () => evaluate(report.assets.map((a) => a.weight), report.optimizer.mu, report.optimizer.cov, report.riskFree).expectedReturn,
    [report]
  );
  const values = report.assets.map((a) => a.value);
  const result = stressTest(values, report.assets.map((a) => ({ equity: a.betaEquity, gold: a.betaGold })), shock, expected);
  const niftyOnly = report.analysedValue * shock.equity;
  const rows = report.assets
    .map((a, i) => ({ a, move: result.moves[i], pnl: values[i] * result.moves[i] }))
    .sort((x, y) => x.pnl - y.pnl);
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  const pick = (id: string) => {
    const s = HISTORICAL_SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setScenarioId(id);
    setShock(s.shock);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {HISTORICAL_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                scenarioId === s.id ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        <p className="min-h-10 text-sm leading-relaxed text-muted-foreground">
          {scenario ? (
            <>
              <span className="font-medium text-foreground">{scenario.period}.</span> {scenario.note}
            </>
          ) : (
            'Your own scenario. Move the sliders to test any combination of shocks.'
          )}
        </p>
        <Slider label="Nifty 50" value={shock.equity} min={-0.7} max={0.3} onChange={(equity) => { setScenarioId('custom'); setShock((s) => ({ ...s, equity })); }} />
        <Slider label="Gold" value={shock.gold} min={-0.4} max={0.4} onChange={(gold) => { setScenarioId('custom'); setShock((s) => ({ ...s, gold })); }} />

        <div className="rounded-xl bg-muted/50 p-4">
          <p className="text-xs text-muted-foreground">Your portfolio would move</p>
          <p className={cn('mt-1 font-serif text-4xl tnum', result.pnl < 0 ? 'text-danger' : 'text-success')}>
            {result.pnl < 0 ? '−' : '+'}
            {formatINRCompact(Math.abs(result.pnl))}
          </p>
          <p className="mt-1 text-sm tnum text-muted-foreground">
            {signedPct(result.portfolioMove)} · the same money in the Nifty 50 would move {signedPct(shock.equity)} ({niftyOnly < 0 ? '−' : '+'}
            {formatINRCompact(Math.abs(niftyOnly))})
          </p>
          {result.recoveryYears != null && (
            <p className="mt-2 text-sm text-foreground">
              At an expected {pct(expected)} a year, recovering would take about{' '}
              <span className="font-semibold">
                {result.recoveryYears < 1 ? `${Math.max(1, Math.round(result.recoveryYears * 12))} months` : `${result.recoveryYears.toFixed(1)} years`}
              </span>
              .
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs text-muted-foreground">Impact by holding (each moves by its measured sensitivity to the Nifty and to gold)</p>
        <ul className="space-y-2">
          {rows.map(({ a, move, pnl }) => (
            <li key={a.instrumentId} className="grid grid-cols-[88px_1fr_96px] items-center gap-3 text-sm">
              <span className="truncate font-medium text-foreground" title={a.name}>{a.symbol}</span>
              <span className="relative h-5 rounded bg-muted/60">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <span
                  className={cn('absolute inset-y-0.5 rounded', pnl < 0 ? 'right-1/2 bg-[var(--danger)]/70' : 'left-1/2 bg-[var(--success)]/70')}
                  style={{ width: `${(Math.abs(pnl) / maxAbs) * 50}%` }}
                />
              </span>
              <span className={cn('text-right tnum text-xs', pnl < 0 ? 'text-danger' : pnl > 0 ? 'text-success' : 'text-muted-foreground')}>
                {signedPct(move, 0)} · {formatINRCompact(Math.abs(pnl))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Sensitivities come from a two-factor regression of each holding&rsquo;s daily returns on the Nifty 50 and gold over the last two
          years. Real crashes are rarely linear, and correlations rise in a panic, so treat this as a floor, not a forecast. Historical
          figures are approximate peak-to-trough Nifty 50 falls; gold moves are rounded assumptions.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-muted-foreground">
        <span>{label} move</span>
        <span className={cn('tnum font-medium', value < 0 ? 'text-danger' : value > 0 ? 'text-success' : 'text-foreground')}>{signedPct(value, 0)}</span>
      </span>
      <input
        type="range"
        min={Math.round(min * 100)}
        max={Math.round(max * 100)}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-2 w-full accent-[var(--primary)]"
        aria-label={`${label} move in per cent`}
      />
    </label>
  );
}
