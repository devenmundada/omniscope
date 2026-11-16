import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isAiConfigured, PRIMARY_MODEL_ID } from '@/lib/ai/model';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { QUESTIONS, runQuestion } from '@/lib/eval/copilot-benchmark';
import { saveResult } from '@/lib/eval/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Runs one Copilot benchmark question for the signed-in user and stores the graded result. */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  if (!isAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { runId?: string; questionId?: string };
  if (!body.runId || !/^[\w-]{6,64}$/.test(body.runId) || !QUESTIONS.some((q) => q.id === body.questionId)) {
    return NextResponse.json({ error: 'Unknown question.' }, { status: 400 });
  }
  const snapshot = await loadFinancialSnapshot(user.id);
  const name = (snapshot.summary.profile?.user?.name as string | undefined) || (user.user_metadata?.full_name as string | undefined) || null;
  const result = await runQuestion(snapshot, name, body.questionId as string);
  await saveResult(user.id, 'copilot', body.runId, result.id, result, PRIMARY_MODEL_ID);
  return NextResponse.json(result);
}
