import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './index';
import { aiConversations, aiMessages } from './schema';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export async function listConversations(userId: string, limit = 20): Promise<ConversationSummary[]> {
  return db
    .select({ id: aiConversations.id, title: aiConversations.title, updatedAt: aiConversations.updatedAt })
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(limit);
}

/** Returns the conversation only if it belongs to the user. */
export async function getOwnedConversation(userId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function ensureConversation(userId: string, conversationId: string, firstQuestion: string) {
  const existing = await getOwnedConversation(userId, conversationId);
  if (existing) return existing;
  const title = firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New conversation';
  const [created] = await db
    .insert(aiConversations)
    .values({ id: conversationId, userId, title })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    // Id collision with another user's conversation: refuse silently by creating nothing.
    return null;
  }
  return created;
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  extra?: { toolCalls?: Array<{ id: string; toolName: string; args: Record<string, unknown> }>; metadata?: Record<string, unknown> }
) {
  await db.insert(aiMessages).values({
    conversationId,
    role,
    content,
    toolCalls: extra?.toolCalls ?? null,
    metadata: extra?.metadata ?? {},
  });
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
}

export async function getConversationMessages(userId: string, conversationId: string) {
  const conv = await getOwnedConversation(userId, conversationId);
  if (!conv) return null;
  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
  return { conversation: conv, messages: rows };
}

export async function deleteConversation(userId: string, conversationId: string) {
  await db.delete(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
}
