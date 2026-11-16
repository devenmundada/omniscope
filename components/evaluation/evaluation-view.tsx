'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, CheckCircle2, FileScan, FlaskConical, Loader2, Play, Timer, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import type { QuestionResult } from '@/lib/eval/copilot-benchmark';
import type { StatementBenchmarkResult } from '@/lib/eval/grading';
import { latencyStats } from '@/lib/eval/grading';
import type { StoredRun } from '@/lib/eval/store';
import type { BacktestReport } from '@/lib/db/backtest';
import { cn } from '@/lib/utils';
import { BacktestPanel } from './backtest-panel';
import { CopyMarkdown } from './copy-markdown';

export interface EvaluationProps {
  questions: Array<{ id: string; category: string; question: string }>;
  fixtures: Array<{ id: string; title: string; format: string; challenge: string; expected: number }>;
  copilotRun: StoredRun<QuestionResult> | null;
  statementRun: StoredRun<StatementBenchmarkResult> | null;
  backtest: BacktestReport | null;
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : '—');
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EvaluationView(props: EvaluationProps) {
  const [copilot, setCopilot] = useState<Record<string, QuestionResult>>(props.copilotRun?.results ?? {});
  const [statements, setStatements] = useState<Record<string, StatementBenchmarkResult>>(props.statementRun?.results ?? {});
  const [copilotAt, setCopilotAt] = useState(props.copilotRun?.updatedAt ?? null);
  const [statementAt, setStatementAt] = useState(props.statementRun?.updatedAt ?? null);
  const [running, setRunning] = useState<null | 'copilot' | 'statement'>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function runSuite(suite: 'copilot' | 'statement') {
    setRunning(suite);
    setRunError(null);
    const runId = `${suite}-${Date.now()}`;
    const ids = suite === 'copilot' ? props.questions.map((q) => q.id) : props.fixtures.map((f) => f.id);
    if (suite === 'copilot') setCopilot({});
    else setStatements({});
    for (const id of ids) {
      setCurrent(id);
      try {
        const res = await fetch(`/api/eval/${suite}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(suite === 'copilot' ? { runId, questionId: id } : { runId, fixtureId: id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (suite === 'copilot') setCopilot((c) => ({ ...c, [id]: json }));
        else setStatements((s) => ({ ...s, [id]: json }));
      } catch (err) {
        setRunError(`${id}: ${err instanceof Error ? err.message : 'request failed'}`);
      }
      // Stay well inside the free Gemini rate limit.
      await sleep(suite === 'copilot' ? 2500 : 1500);
    }
    const now = new Date().toISOString();
    if (suite === 'copilot') setCopilotAt(now);
    else setStatementAt(now);
    setCurrent(null);
    setRunning(null);
  }

  // ---------- Copilot aggregates ----------
  const cr = props.questions.map((q) => copilot[q.id]).filter(Boolean) as QuestionResult[];
  const facts = cr.flatMap((r) => r.facts);
  const toolRows = cr.filter((r) => r.toolCorrect != null);
  const guard = cr.filter((r) => r.category === 'Guardrail');
  const lat = latencyStats(cr.filter((r) => !r.error).map((r) => r.latencyMs));
  const categories = [...new Set(props.questions.map((q) => q.category))];
  const copilotMd = [
    `Copilot benchmark (${cr.length} questions, model ${cr[0]?.model ?? 'n/a'}${copilotAt ? `, run ${when(copilotAt)}` : ''})`,
    '',
    '| Category | Questions | Passed | Numeric facts correct | Right tool called |',
    '|---|---|---|---|---|',
    ...categories.map((c) => {
      const rs = cr.filter((r) => r.category === c);
      const f = rs.flatMap((r) => r.facts);
      const t = rs.filter((r) => r.toolCorrect != null);
      return `| ${c} | ${rs.length} | ${rs.filter((r) => r.passed).length} | ${f.length ? `${f.filter((x) => x.passed).length}/${f.length}` : '—'} | ${t.length ? `${t.filter((x) => x.toolCorrect).length}/${t.length}` : '—'} |`;
    }),
    `| **All** | ${cr.length} | ${cr.filter((r) => r.passed).length} | ${facts.filter((f) => f.passed).length}/${facts.length} | ${toolRows.filter((r) => r.toolCorrect).length}/${toolRows.length} |`,
    '',
    `Latency (successful answers): median ${secs(lat.median)}, 95th percentile ${secs(lat.p95)}. Errors: ${cr.filter((r) => r.error).length}.`,
  ].join('\n');

  // ---------- Statement aggregates ----------
  const sr = props.fixtures.map((f) => statements[f.id]).filter(Boolean) as StatementBenchmarkResult[];
  const scored = sr.filter((r) => r.score);
  const sum = (fn: (r: StatementBenchmarkResult) => number) => scored.reduce((a, r) => a + fn(r), 0);
  const fieldNames = ['name', 'isin', 'quantity', 'averageCost', 'totalCost'] as const;
  const fieldLabels: Record<(typeof fieldNames)[number], string> = { name: 'Name', isin: 'ISIN', quantity: 'Quantity', averageCost: 'Average cost', totalCost: 'Total cost' };
  const fieldTotals = fieldNames.map((f) => ({ f, correct: sum((r) => r.score!.fields[f].correct), total: sum((r) => r.score!.fields[f].total) }));
  const allCorrect = fieldTotals.reduce((a, x) => a + x.correct, 0);
  const allTotal = fieldTotals.reduce((a, x) => a + x.total, 0);
  const sLat = latencyStats(sr.filter((r) => !r.error).map((r) => r.latencyMs));
  const statementMd = [
    `Statement Reader benchmark (${sr.length} documents, ${sum((r) => r.score!.truthCount)} holdings${statementAt ? `, run ${when(statementAt)}` : ''})`,
    '',
    '| Document | Format | Holdings found / expected | Precision | Recall | Fields correct | Time |',
    '|---|---|---|---|---|---|---|',
    ...sr.map((r) => {
      const s = r.score;
      const fc = s ? fieldNames.reduce((a, f) => a + s.fields[f].correct, 0) : 0;
      const ft = s ? fieldNames.reduce((a, f) => a + s.fields[f].total, 0) : 0;
      return `| ${r.title} | ${r.format} | ${s ? `${s.matched} / ${s.truthCount}` : 'error'} | ${s ? pct(s.matched, s.extractedCount || (s.truthCount === 0 ? 1 : 0)) : '—'} | ${s ? pct(s.matched, s.truthCount || 1) : '—'} | ${s ? `${fc}/${ft}` : '—'} | ${secs(r.latencyMs)} |`;
    }),
    '',
    `Field accuracy: ${fieldTotals.map((x) => `${fieldLabels[x.f]} ${x.correct}/${x.total}`).join(', ')}; overall ${allCorrect}/${allTotal}. Median time ${secs(sLat.median)}.`,
  ].join('\n');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Evaluation"
        title="How do we know it works?"
        question="Three reproducible benchmarks: the AI Copilot against figures computed by the engines, the Statement Reader against documents with known answers, and the optimiser in a five-year walk-forward backtest."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Bot className="size-4" />} label="Copilot numeric accuracy" value={pct(facts.filter((f) => f.passed).length, facts.length)} hint={`${facts.filter((f) => f.passed).length} of ${facts.length} figures matched the engines`} />
        <Kpi icon={<CheckCircle2 className="size-4" />} label="Right tool called" value={pct(toolRows.filter((r) => r.toolCorrect).length, toolRows.length)} hint={`Guardrails passed: ${guard.filter((g) => g.passed).length}/${guard.length}`} />
        <Kpi icon={<FileScan className="size-4" />} label="Statement fields correct" value={pct(allCorrect, allTotal)} hint={`${sum((r) => r.score!.matched)} of ${sum((r) => r.score!.truthCount)} holdings found`} />
        <Kpi icon={<Timer className="size-4" />} label="Copilot median answer" value={cr.length ? secs(lat.median) : '—'} hint={cr.length ? `95th percentile ${secs(lat.p95)}` : 'Run the benchmark'} />
      </div>

      {runError && <p className="rounded-lg border border-danger/30 bg-danger-muted/30 px-4 py-2 text-sm text-danger">Last error: {runError}</p>}

      <Section
        icon={<Bot className="size-4" />}
        title="AI Copilot benchmark"
        subtitle={`${props.questions.length} questions across ${categories.length} areas. Expected figures come from calling the same tools the Copilot uses; an answer passes only if every expected figure appears (normal rounding allowed) and every text check holds.`}
        action={
          <RunButton running={running === 'copilot'} disabled={running != null} onClick={() => runSuite('copilot')} label={`Run ${props.questions.length} questions`} progress={running === 'copilot' ? `${cr.length}/${props.questions.length}` : null} />
        }
        meta={copilotAt ? `Last run ${when(copilotAt)}` : 'Not run yet'}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Question</th>
                <th className="py-2 font-medium">Expected</th>
                <th className="py-2 font-medium">Tools called</th>
                <th className="py-2 text-right font-medium">Time</th>
                <th className="py-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {props.questions.map((q) => {
                const r = copilot[q.id];
                return (
                  <tr key={q.id} className={cn('border-b border-border/60 align-top', current === q.id && 'bg-primary/5')}>
                    <td className="py-2 pr-3">
                      <span className="text-[11px] text-muted-foreground">{q.category}</span>
                      <span className="block">{q.question}</span>
                      {r?.answer && (
                        <details className="mt-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">Answer</summary>
                          <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                        </details>
                      )}
                      {r?.error && <span className="block text-xs text-danger">{r.error}</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r
                        ? [...r.facts.map((f) => ({ label: `${f.label}: ${fmtFact(f.expected, f.unit)}`, ok: f.passed })), ...r.checks.map((c) => ({ label: c.label, ok: c.passed }))].map((x) => (
                            <span key={x.label} className={cn('block', x.ok ? 'text-success' : 'text-danger')}>
                              {x.ok ? '✓' : '✗'} {x.label}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {r ? (r.toolsCalled.length ? r.toolsCalled.join(', ') : 'none') : '—'}
                      {r && r.toolCorrect === false && <span className="block text-danger">expected {r.expectedTools.join(' or ')}</span>}
                    </td>
                    <td className="py-2 text-right text-xs tnum text-muted-foreground">{r ? secs(r.latencyMs) : current === q.id ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : '—'}</td>
                    <td className="py-2 text-right">{r ? <Verdict ok={r.passed} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cr.length > 0 && (
          <div className="mt-4 flex justify-end">
            <CopyMarkdown markdown={copilotMd} />
          </div>
        )}
      </Section>

      <Section
        icon={<FileScan className="size-4" />}
        title="Statement Reader benchmark"
        subtitle="Six synthetic documents with known answers, each built to trip the reader up in a different way. Holdings are paired by ISIN (or name); quantities must match to 0.01% and costs to 0.5%."
        action={
          <RunButton running={running === 'statement'} disabled={running != null} onClick={() => runSuite('statement')} label={`Run ${props.fixtures.length} documents`} progress={running === 'statement' ? `${sr.length}/${props.fixtures.length}` : null} />
        }
        meta={statementAt ? `Last run ${when(statementAt)}` : 'Not run yet'}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Document</th>
                <th className="py-2 text-right font-medium">Found</th>
                <th className="py-2 text-right font-medium">Precision</th>
                <th className="py-2 text-right font-medium">Recall</th>
                <th className="py-2 text-right font-medium">Fields</th>
                <th className="py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {props.fixtures.map((f) => {
                const r = statements[f.id];
                const s = r?.score;
                const fc = s ? fieldNames.reduce((a, k) => a + s.fields[k].correct, 0) : 0;
                const ft = s ? fieldNames.reduce((a, k) => a + s.fields[k].total, 0) : 0;
                return (
                  <tr key={f.id} className={cn('border-b border-border/60 align-top', current === f.id && 'bg-primary/5')}>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{f.title}</span> <span className="text-xs text-muted-foreground">· {f.format}</span>
                      <span className="block text-xs text-muted-foreground">{f.challenge}</span>
                      {s && s.errors.length > 0 && (
                        <details className="mt-1 text-xs text-danger">
                          <summary className="cursor-pointer">{s.errors.length} discrepanc{s.errors.length === 1 ? 'y' : 'ies'}</summary>
                          <ul className="mt-1 list-disc pl-4">{s.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                        </details>
                      )}
                      {r?.error && <span className="block text-xs text-danger">{r.error}</span>}
                    </td>
                    <td className="py-2 text-right tnum">{s ? `${s.matched} / ${s.truthCount}` : current === f.id ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : '—'}</td>
                    <td className="py-2 text-right tnum">{s ? (s.extractedCount === 0 && s.truthCount === 0 ? '100%' : pct(s.matched, s.extractedCount)) : '—'}</td>
                    <td className="py-2 text-right tnum">{s ? (s.truthCount === 0 ? '—' : pct(s.matched, s.truthCount)) : '—'}</td>
                    <td className="py-2 text-right tnum">{s ? (ft ? `${fc}/${ft}` : '—') : '—'}</td>
                    <td className="py-2 text-right text-xs tnum text-muted-foreground">{r ? secs(r.latencyMs) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sr.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {fieldTotals.filter((x) => x.total > 0).map((x) => `${fieldLabels[x.f]} ${pct(x.correct, x.total)}`).join(' · ')}
            </p>
            <CopyMarkdown markdown={statementMd} />
          </div>
        )}
      </Section>

      <Section
        icon={<FlaskConical className="size-4" />}
        title="Optimiser backtest"
        subtitle="Does the Risk Lab optimiser actually help? A walk-forward test on your own holdings, using five years of verified prices and no look-ahead."
        meta={props.backtest ? `${props.backtest.years.toFixed(1)} years out of sample` : undefined}
      >
        {props.backtest ? <BacktestPanel report={props.backtest} /> : <p className="text-sm text-muted-foreground">Needs at least eighteen months of price history for your holdings.</p>}
      </Section>
    </div>
  );
}

function fmtFact(v: number, unit: string) {
  if (unit === 'pct') return `${v}%`;
  if (unit === 'inr') return `₹${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;
  return String(v);
}

function Section({ icon, title, subtitle, action, meta, children }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode; meta?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function RunButton({ running, disabled, onClick, label, progress }: { running: boolean; disabled: boolean; onClick: () => void; label: string; progress: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {running ? `Running ${progress}` : label}
    </button>
  );
}

function Verdict({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" />Pass</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-danger"><XCircle className="size-3.5" />Fail</span>
  );
}

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-serif text-2xl tnum tracking-tight">{value}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </Card>
  );
}
