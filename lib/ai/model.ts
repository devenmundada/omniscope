import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Google Gemini (free tier) is the default model provider.
 * GOOGLE_GENERATIVE_AI_API_KEY must be set in the server environment.
 * GEMINI_MODEL / GEMINI_FALLBACK_MODEL can override the model IDs without code changes.
 */
export const PRIMARY_MODEL_ID = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
export const FALLBACK_MODEL_ID = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-2.5-flash-lite';

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

/** Runs an AI call with the primary model, retrying once on the lighter fallback model (e.g. quota limits). */
export async function withModelFallback<T>(fn: (model: ReturnType<typeof primaryModel>, modelId: string) => Promise<T>): Promise<T> {
  try {
    return await fn(primaryModel(), PRIMARY_MODEL_ID);
  } catch (err) {
    if (FALLBACK_MODEL_ID === PRIMARY_MODEL_ID) throw err;
    return await fn(fallbackModel(), FALLBACK_MODEL_ID);
  }
}

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI features are not configured yet. Add GOOGLE_GENERATIVE_AI_API_KEY (a free Google AI Studio key) in the Vercel project settings and redeploy.';
