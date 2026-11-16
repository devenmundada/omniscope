import { NextResponse } from 'next/server';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError, generateText } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isAiConfigured } from '@/lib/ai/model';

// TEMPORARY diagnostic: which Gemini models answer for this key, and how fast. Remove after model selection.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CANDIDATES = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

export async function GET() {
  if (!isSupabaseConfigured() || !isAiConfigured()) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'sign in' }, { status: 401 });

  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() });
  const results = await Promise.all(
    CANDIDATES.map(async (id) => {
      const t0 = Date.now();
      try {
        const r = await generateText({ model: google(id), prompt: 'Reply with the single word OK.', maxRetries: 0, timeout: { totalMs: 40_000 } });
        return { id, ok: true, ms: Date.now() - t0, text: r.text.slice(0, 40) };
      } catch (err) {
        const status = APICallError.isInstance(err) ? err.statusCode : undefined;
        const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 300);
        return { id, ok: false, ms: Date.now() - t0, status, message };
      }
    })
  );
  return NextResponse.json({ results });
}
