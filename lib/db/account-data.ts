import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './index';
import { accounts, aiConversations, aiInsightCache, aiMessages, financialProfiles, goals, holdings, instruments, transactions, users } from './schema';

/**
 * Data-rights helpers (Digital Personal Data Protection Act, 2023): a full export of everything
 * OmniScope stores about a user, and erasure of the account and all of it.
 */

export const EXPORT_FORMAT = 'omniscope-export-v1';

/** Everything stored for the user, as plain JSON (no other user's data, no secrets). */
export async function exportUserData(userId: string) {
  const [user, profile, accts, held, txs, userGoals, conversations, insights] = await Promise.all([
    db.select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db.select().from(financialProfiles).where(eq(financialProfiles.userId, userId)),
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({ holding: holdings, symbol: instruments.symbol, instrument: instruments.name, isin: instruments.isin })
      .from(holdings)
      .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
      .where(eq(holdings.userId, userId)),
    db
      .select({ transaction: transactions, symbol: instruments.symbol })
      .from(transactions)
      .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
      .where(eq(transactions.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db.select().from(aiConversations).where(eq(aiConversations.userId, userId)),
    db
      .select({ kind: aiInsightCache.kind, cacheKey: aiInsightCache.cacheKey, content: aiInsightCache.content, model: aiInsightCache.model, createdAt: aiInsightCache.createdAt })
      .from(aiInsightCache)
      .where(eq(aiInsightCache.userId, userId)),
  ]);
  const ids = conversations.map((c) => c.id);
  const messages = ids.length
    ? await db
        .select({ conversationId: aiMessages.conversationId, role: aiMessages.role, content: aiMessages.content, toolCalls: aiMessages.toolCalls, createdAt: aiMessages.createdAt })
        .from(aiMessages)
        .where(inArray(aiMessages.conversationId, ids))
    : [];

  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    notice:
      'Everything OmniScope stores about you. Market prices and fund data are public and not included. Generated under your right of access (DPDP Act, 2023, s.11).',
    user: user[0] ?? null,
    financialProfile: profile[0] ?? null,
    accounts: accts,
    holdings: held.map((h) => ({ ...h.holding, symbol: h.symbol, instrument: h.instrument, isin: h.isin })),
    transactions: txs.map((t) => ({ ...t.transaction, symbol: t.symbol })),
    goals: userGoals,
    copilotConversations: conversations.map((c) => ({
      ...c,
      messages: messages.filter((m) => m.conversationId === c.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    })),
    cachedAiInsights: insights,
  };
}

/**
 * Deletes the sign-in identity. Every table holding the user's data references it with
 * ON DELETE CASCADE (auth.users -> users -> profile, accounts, holdings, transactions, goals,
 * conversations and messages, AI caches), so one statement erases all of it atomically.
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  const rows = await db.execute(sql`delete from auth.users where id = ${userId} returning id`);
  return rows.length === 1;
}
