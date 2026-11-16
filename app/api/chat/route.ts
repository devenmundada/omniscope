import { NextResponse, type NextRequest } from 'next/server';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured, PRIMARY_MODEL_ID, primaryModel } from '@/lib/ai/model';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { buildCopilotTools } from '@/lib/ai/copilot-tools';
import { copilotSystemPrompt } from '@/lib/ai/copilot-prompt';
import { appendMessage, ensureConversation } from '@/lib/db/conversations';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textOf(message: UIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to use the AI Copilot.' }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ error: AI_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  let body: { id?: string; messages?: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const messages = (body.messages ?? []).slice(-20); // bound context size
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const question = textOf(lastUser);
  if (!question) {
    return NextResponse.json({ error: 'Empty question.' }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question is too long (max 2,000 characters).' }, { status: 400 });
  }

  // Persist the conversation (best-effort; chat still works if persistence fails)
  const conversationId = body.id && UUID_RE.test(body.id) ? body.id : null;
  let persist = false;
  if (conversationId) {
    try {
      const conv = await ensureConversation(user.id, conversationId, question);
      if (conv) {
        await appendMessage(conversationId, 'user', question);
        persist = true;
      }
    } catch (err) {
      logger.warn('Copilot: failed to persist user message', err instanceof Error ? err.message : err);
    }
  }

  const snapshot = await loadFinancialSnapshot(user.id);
  const userName =
    (snapshot.summary.profile?.user?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    null;

  const result = streamText({
    model: primaryModel(),
    system: copilotSystemPrompt({
      userName,
      today: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    }),
    messages: await convertToModelMessages(messages),
    tools: buildCopilotTools(snapshot),
    stopWhen: stepCountIs(6),
    // Low thinking keeps multi-step tool answers well inside the 60 s function limit.
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
    onEnd: async (event) => {
      if (!persist || !conversationId) return;
      try {
        const toolCalls = event.steps.flatMap((s) =>
          s.toolCalls.map((c) => ({ id: c.toolCallId, toolName: c.toolName, args: (c.input ?? {}) as Record<string, unknown> }))
        );
        const finalText = event.steps.map((s) => s.text).filter(Boolean).join('\n\n').trim() || event.text;
        await appendMessage(conversationId, 'assistant', finalText || '(no text)', {
          toolCalls,
          metadata: { model: PRIMARY_MODEL_ID },
        });
      } catch (err) {
        logger.warn('Copilot: failed to persist assistant message', err instanceof Error ? err.message : err);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Copilot stream error:', msg);
      if (/quota|rate|429|exhausted/i.test(msg)) {
        return 'The free AI quota is busy right now. Please wait a minute and try again.';
      }
      if (/not found|not supported|no longer available|404/i.test(msg)) {
        return `The AI model "${PRIMARY_MODEL_ID}" is not available to this API key. Set GEMINI_MODEL to a current Gemini model in the deployment settings.`;
      }
      if (/api key|API_KEY|permission|401|403/i.test(msg)) {
        return 'The AI service rejected the API key. Please check GOOGLE_GENERATIVE_AI_API_KEY in the deployment settings.';
      }
      return 'Something went wrong while generating the answer. Please try again.';
    },
  });
}
