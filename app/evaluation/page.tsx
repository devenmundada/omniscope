import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { EvaluationView } from '@/components/evaluation/evaluation-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { QUESTIONS, type QuestionResult } from '@/lib/eval/copilot-benchmark';
import { STATEMENT_FIXTURES } from '@/lib/eval/statement-fixtures';
import { getRun } from '@/lib/eval/store';
import { getBacktestReport } from '@/lib/db/backtest';
import type { StatementBenchmarkResult } from '@/lib/eval/grading';

export const metadata = { title: 'Evaluation — OmniScope' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function EvaluationPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [copilotRun, statementRun, backtest] = await Promise.all([
        getRun<QuestionResult>(user.id, 'copilot'),
        getRun<StatementBenchmarkResult>(user.id, 'statement'),
        getBacktestReport(user.id).catch(() => null),
      ]);
      return (
        <EvaluationView
          questions={QUESTIONS.map((q) => ({ id: q.id, category: q.category, question: q.question }))}
          fixtures={STATEMENT_FIXTURES.map((f) => ({ id: f.id, title: f.title, format: f.format, challenge: f.challenge, expected: f.truth.length }))}
          copilotRun={copilotRun}
          statementRun={statementRun}
          backtest={backtest}
        />
      );
    }
  }
  return (
    <div>
      <PageHeader eyebrow="Evaluation" title="How do we know it works?" question="Benchmarks for the AI Copilot, the Statement Reader and the portfolio optimiser." />
      <Card className="max-w-xl p-6 text-sm text-muted-foreground">
        <Link href="/auth/login?next=%2Fevaluation" className="font-medium text-primary hover:underline">Sign in</Link> to run the benchmarks on your
        portfolio.
      </Card>
    </div>
  );
}
