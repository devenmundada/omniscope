import { pgTable, text, timestamp, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New Consultation'),
    pinned: boolean('pinned').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_conversations_user_id_idx').on(table.userId),
  ]
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    // Role: 'user' | 'assistant' | 'system' | 'tool'
    role: text('role').notNull(),
    // Main textual content of message
    content: text('content').notNull(),
    // Tool calls initiated by AI mentor (e.g. showPortfolioHighlight, showHealthCard)
    toolCalls: jsonb('tool_calls').$type<Array<{
      id: string;
      toolName: string;
      args: Record<string, unknown>;
    }>>(),
    // Tool results returned from execution
    toolResults: jsonb('tool_results').$type<Array<{
      toolCallId: string;
      result: unknown;
    }>>(),
    // Context snapshot (portfolio value at time of conversation, confidence score, etc.)
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_messages_conversation_id_idx').on(table.conversationId),
    index('ai_messages_created_at_idx').on(table.createdAt),
  ]
);

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [aiConversations.userId],
    references: [users.id],
  }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
