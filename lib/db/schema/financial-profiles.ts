import { pgTable, text, timestamp, uuid, numeric, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const financialProfiles = pgTable('financial_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  investorArchetype: text('investor_archetype').default('The Patient Compounder'),
  riskStyle: text('risk_style').default('Measured & Calculated'),
  decisionStyle: text('decision_style').default('Data-Informed'),
  // Monthly cash flows in INR (precision: 14, scale: 2)
  monthlyIncome: numeric('monthly_income', { precision: 14, scale: 2 }),
  monthlyExpenses: numeric('monthly_expenses', { precision: 14, scale: 2 }),
  // Emergency fund configuration
  emergencyFundTargetMonths: integer('emergency_fund_target_months').default(6),
  emergencyFundActual: numeric('emergency_fund_actual', { precision: 14, scale: 2 }),
  // Insurance coverage for protection pillar
  termInsuranceCover: numeric('term_insurance_cover', { precision: 14, scale: 2 }),
  healthInsuranceCover: numeric('health_insurance_cover', { precision: 14, scale: 2 }),
  // Behavioral and risk tolerance metrics (0 - 100)
  riskToleranceScore: integer('risk_tolerance_score').default(70),
  // Extensible profile preferences (currency, notification settings, etc.)
  preferences: jsonb('preferences').$type<{
    theme?: 'light' | 'dark' | 'system';
    currency?: string;
    notificationsEnabled?: boolean;
    hideBalances?: boolean;
  }>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const financialProfilesRelations = relations(financialProfiles, ({ one }) => ({
  user: one(users, {
    fields: [financialProfiles.userId],
    references: [users.id],
  }),
}));

export type FinancialProfile = typeof financialProfiles.$inferSelect;
export type NewFinancialProfile = typeof financialProfiles.$inferInsert;
