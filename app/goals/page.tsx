import { createClient } from '@/lib/supabase/server';
import { getPersonalFinancialSummary } from '@/lib/db/financial-summary';
import { RealGoalsView } from '@/components/goals/real-goals-view';
import { DemoGoalsView } from '@/components/goals/demo-goals-view';

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

    return (
      <RealGoalsView
        goals={summary.goalsSummary.projections}
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
