import { createClient } from '@/lib/supabase/server';
import { getPersonalFinancialSummary } from '@/lib/db/financial-summary';
import { RealGoalsView } from '@/components/goals/real-goals-view';
import { DemoGoalsView } from '@/components/goals/demo-goals-view';
import { getPortfolioPerformance } from '@/lib/db/performance';
import { goalAssumptions, simulateGoalFromDetails } from '@/lib/db/goal-simulation';

export const metadata = {
  title: 'Goals — OmniScope',
};

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is authenticated, render user's real persisted goals and mathematical projections
  if (user) {
    const summary = await getPersonalFinancialSummary(user.id);
    const performance = await getPortfolioPerformance(summary.holdings).catch(() => null);
    // Same model as the Risk Lab, Copilot, alerts and goal optimiser, so every page agrees.
    const assumptions = await goalAssumptions(user.id, summary.holdings, performance?.assetClassStats ?? []);
    const goalsWithSimulation = summary.goalsSummary.projections.map((p, i) => ({
      ...p,
      simulation: simulateGoalFromDetails(p.details, assumptions, i),
    }));

    return (
      <RealGoalsView
        goals={goalsWithSimulation}
        totalTargetAmount={summary.goalsSummary.totalTargetAmount}
        totalCurrentAllocated={summary.goalsSummary.totalCurrentAllocated}
        totalMonthlyCommitment={summary.goalsSummary.totalMonthlyCommitment}
        onTrackCount={summary.goalsSummary.onTrackCount}
        userEmail={user.email}
      />
    );
  }

  // Fallback to reference demo experience for unauthenticated visitors
  return <DemoGoalsView />;
}
