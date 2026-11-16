import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError, RetryError } from 'ai';
import { logger } from '@/lib/logger';

/**
 * Google Gemini (free tier) is the default model provider.
 * GOOGLE_GENERATIVE_AI_API_KEY must be set in the server environment.
 * GEMINI_MODEL / GEMINI_FALLBACK_MODEL can override the model IDs without code changes.
 *
 * Gemini 2.5 models are unavailable to new API keys. Measured on the free tier (16 Nov 2026) with a
 * one-word prompt: gemini-3.5-flash-lite 0.7 s, gemini-3.1-flash-lite 1.8 s, gemini-3.6-flash 39 s,
 * gemini-3.8-flash no answer within 40 s. The Flash-Lite models are the only ones that fit a 60 s
 * serverless function. Gemini 3.6+ ignores temperature/top_p/top_k (and will reject them in later
 * generations), so callers must not pass sampling parameters.
 */
export const PRIMARY_MODEL_ID = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
export const FALLBACK_MODEL_ID = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.1-flash-lite';

export function isAiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}

const provider = () => createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() });

export function primaryModel() {
  return provider()(PRIMARY_MODEL_ID);
}

export function fallbackModel() {
  return provider()(FALLBACK_MODEL_ID);
}

/**
 * Gemini answers 429/503 with retry-after headers of up to ~60 s, and the AI SDK honours them on
 * every retry. On a 60 s serverless function that gets the request killed before the fallback
 * model or an error message can run, so AI calls fail fast and fall back instead.
 */
export const AI_MAX_RETRIES = 0;

/** Per-model time budget, so a slow primary still leaves the fallback time to answer within 60 s. */
export const AI_ATTEMPT_TIMEOUT = { totalMs: 25_000 } as const;

/** Runs an AI call with the primary model, retrying once on the lighter fallback model (e.g. quota limits, slowness). */
export async function withModelFallback<T>(
  fn: (model: ReturnType<typeof primaryModel>, modelId: string, timeout: typeof AI_ATTEMPT_TIMEOUT) => Promise<T>
): Promise<T> {
  try {
    return await fn(primaryModel(), PRIMARY_MODEL_ID, AI_ATTEMPT_TIMEOUT);
  } catch (err) {
    if (FALLBACK_MODEL_ID === PRIMARY_MODEL_ID) throw err;
    logger.warn(`AI: ${PRIMARY_MODEL_ID} failed (status ${aiErrorStatus(err) ?? 'n/a'}); trying ${FALLBACK_MODEL_ID}`);
    return await fn(fallbackModel(), FALLBACK_MODEL_ID, AI_ATTEMPT_TIMEOUT);
  }
}

function rootAiError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err;
}

/** HTTP status returned by the Gemini API, when the failure came from the API call itself. */
export function aiErrorStatus(err: unknown): number | undefined {
  const e = rootAiError(err);
  return APICallError.isInstance(e) ? e.statusCode : undefined;
}

/** User-facing explanation of a Gemini failure, including Google's status code for troubleshooting. */
export function describeAiError(err: unknown, modelId: string = PRIMARY_MODEL_ID): string {
  const e = rootAiError(err);
  const msg = e instanceof Error ? e.message : String(e);
  const status = aiErrorStatus(e);
  const code = status ? ` (Google error ${status})` : '';
  if (status === 429 || /quota|rate limit|exhausted/i.test(msg)) {
    return `The free Gemini quota is used up for the moment${code}. Please wait a minute and try again.`;
  }
  if (status === 404 || /not found|no longer available/i.test(msg)) {
    return `The AI model "${modelId}" is not available to this API key${code}. Set GEMINI_MODEL to a current Gemini model in the deployment settings.`;
  }
  if (status === 401 || status === 403 || /api key|API_KEY|permission/i.test(msg)) {
    return `The AI service rejected the API key${code}. Please check GOOGLE_GENERATIVE_AI_API_KEY in the deployment settings.`;
  }
  if (e instanceof Error && (/timeout|abort/i.test(e.name) || /timed? ?out|aborted/i.test(msg))) {
    return 'Gemini took too long to answer. Please try again in a moment.';
  }
  if ((status != null && status >= 500) || /overloaded|unavailable/i.test(msg)) {
    return `Google's Gemini service is busy right now${code}. Please try again in a minute.`;
  }
  return `Something went wrong while generating the answer${code}. Please try again.`;
}

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI features are not configured yet. Add GOOGLE_GENERATIVE_AI_API_KEY (a free Google AI Studio key) in the Vercel project settings and redeploy.';
