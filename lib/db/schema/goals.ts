import { pgTable, text, timestamp, uuid, numeric, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Standard goal icons matching frontend: 'home' | 'graduation' | 'palm' | 'car' | 'shield'
    icon: text('icon').notNull().default('shield'),
    // Target goal amount in INR
    targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
    // Current corpus allocated specifically to this goal
    currentAllocatedAmount: numeric('current_allocated_amount', { precision: 14, scale: 2 }).default('0').notNull(),
    // Planned monthly SIP / contribution dedicated to this goal
    monthlyContribution: numeric('monthly_contribution', { precision: 14, scale: 2 }).default('0').notNull(),
    // Target completion year (e.g. 2028, 2035, 2044)
    targetYear: integer('target_year').notNull(),
    targetDate: timestamp('target_date', { withTimezone: true }),
    // Priority order (1 = highest)
    priority: integer('priority').default(1).notNull(),
    // Category classification: 'RETIREMENT' | 'EDUCATION' | 'HOUSING' | 'VEHICLE' | 'EMERGENCY' | 'OTHER'
    category: text('category').default('OTHER'),
    notes: text('notes'),
    // Simulation parameters (custom inflation rate, expected CAGR percentage)
    metadata: jsonb('metadata').$type<{
      assumedCagrPct?: number;
      assumedInflationPct?: number;
      targetAge?: number;
    }>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('goals_user_id_idx').on(table.userId),
    index('goals_priority_idx').on(table.priority),
  ]
);

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
}));

export type GoalEntity = typeof goals.$inferSelect;
export type NewGoalEntity = typeof goals.$inferInsert;
