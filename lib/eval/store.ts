import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiInsightCache } from '@/lib/db/schema';

export type EvalSuite = 'copilot' | 'statement';

export interface StoredRun<T> {
  runId: string;
  startedAt: string;
  updatedAt: string;
  results: Record<string, T>;
}

const KIND = 'evaluation';
const FAR_FUTURE = new Date('2099-01-01T00:00:00Z');

export async function getRun<T>(userId: string, suite: EvalSuite): Promise<StoredRun<T> | null> {
  const [row] = await db
    .select({ content: aiInsightCache.content })
    .from(aiInsightCache)
    .where(and(eq(aiInsightCache.userId, userId), eq(aiInsightCache.kind, KIND), eq(aiInsightCache.cacheKey, suite)))
    .limit(1);
  return (row?.content as unknown as StoredRun<T>) ?? null;
}

/** Adds one result to the user's latest run of a suite; a new runId starts a fresh run. */
export async function saveResult<T>(userId: string, suite: EvalSuite, runId: string, id: string, result: T, model: string): Promise<void> {
  const existing = await getRun<T>(userId, suite);
  const now = new Date().toISOString();
  const run: StoredRun<T> =
    existing && existing.runId === runId
      ? { ...existing, updatedAt: now, results: { ...existing.results, [id]: result } }
      : { runId, startedAt: now, updatedAt: now, results: { [id]: result } };
  await db
    .insert(aiInsightCache)
    .values({ userId, kind: KIND, cacheKey: suite, content: run as unknown as Record<string, unknown>, model, expiresAt: FAR_FUTURE })
    .onConflictDoUpdate({
      target: [aiInsightCache.userId, aiInsightCache.kind, aiInsightCache.cacheKey],
      set: { content: run as unknown as Record<string, unknown>, model, expiresAt: FAR_FUTURE, createdAt: new Date() },
    });
}
