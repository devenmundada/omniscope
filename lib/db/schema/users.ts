import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { financialProfiles } from './financial-profiles';
import { accounts } from './accounts';
import { holdings } from './holdings';
import { transactions } from './transactions';
import { goals } from './goals';
import { aiConversations } from './ai-conversations';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  financialProfile: one(financialProfiles, {
    fields: [users.id],
    references: [financialProfiles.userId],
  }),
  accounts: many(accounts),
  holdings: many(holdings),
  transactions: many(transactions),
  goals: many(goals),
  aiConversations: many(aiConversations),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
