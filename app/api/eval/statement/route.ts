import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isAiConfigured } from '@/lib/ai/model';
import { extractStatement } from '@/lib/ai/statement-reader';
import { STATEMENT_FIXTURES } from '@/lib/eval/statement-fixtures';
import { scoreStatement, type StatementBenchmarkResult } from '@/lib/eval/grading';
import { saveResult } from '@/lib/eval/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Runs the Statement Reader on one benchmark document and scores it against the known answer. */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  if (!isAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { runId?: string; fixtureId?: string };
  const fixture = STATEMENT_FIXTURES.find((f) => f.id === body.fixtureId);
  if (!body.runId || !/^[\w-]{6,64}$/.test(body.runId) || !fixture) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 });

  const started = Date.now();
  let result: StatementBenchmarkResult;
  try {
    const out = await extractStatement({ bytes: fixture.bytes(), mediaType: fixture.mediaType, filename: fixture.filename });
    result = {
      id: fixture.id,
      title: fixture.title,
      format: fixture.format,
      challenge: fixture.challenge,
      score: scoreStatement(fixture.truth, out.holdings),
      catalogueMatched: out.rows.filter((r) => r.matched).length,
      latencyMs: Date.now() - started,
      model: out.modelId,
      error: null,
    };
  } catch (err) {
    // An empty extraction is the correct answer for a document that is not a statement.
    const empty = fixture.truth.length === 0 && err instanceof Error && /could not read any holdings/i.test(err.message);
    result = {
      id: fixture.id,
      title: fixture.title,
      format: fixture.format,
      challenge: fixture.challenge,
      score: empty ? scoreStatement([], []) : null,
      catalogueMatched: 0,
      latencyMs: Date.now() - started,
      model: null,
      error: empty ? null : err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
  await saveResult(user.id, 'statement', body.runId, fixture.id, result, result.model ?? 'n/a');
  return NextResponse.json(result);
}
