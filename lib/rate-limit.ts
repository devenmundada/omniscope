import 'server-only';
import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';

/** Copilot questions allowed per user: protects the shared AI quota from one runaway client. */
export const COPILOT_LIMITS = [
  { windowMs: 60 * 60_000, max: 40, label: 'hour' },
  { windowMs: 24 * 60 * 60_000, max: 200, label: 'day' },
] as const;

/** Counts the user's stored Copilot questions in each window; returns a message if a limit is reached. */
export async function copilotRateLimit(userId: string, now = Date.now()): Promise<{ limited: false } | { limited: true; message: string; retryAfterS: number }> {
  for (const l of COPILOT_LIMITS) {
    const since = new Date(now - l.windowMs);
    const [row] = await db
      .select({ n: count() })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
      .where(and(eq(aiConversations.userId, userId), eq(aiMessages.role, 'user'), gte(aiMessages.createdAt, since)));
    if ((row?.n ?? 0) >= l.max) {
      return {
        limited: true,
        message: `You have asked ${l.max} questions in the last ${l.label}, the fair-use limit. Please try again a little later.`,
        retryAfterS: l.label === 'hour' ? 15 * 60 : 60 * 60,
      };
    }
  }
  return { limited: false };
}

/**
 * A small fixed-window limiter kept in memory. On serverless platforms each instance has its own
 * window, so this caps bursts rather than enforcing an exact global quota.
 */
const windows = new Map<string, { start: number; n: number }>();
export function burstLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, n: 1 });
    if (windows.size > 5000) windows.clear();
    return false;
  }
  w.n += 1;
  return w.n > max;
}
