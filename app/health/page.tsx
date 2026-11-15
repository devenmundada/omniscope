import { createClient } from '@/lib/supabase/server';
import { getPersonalFinancialSummary } from '@/lib/db/financial-summary';
import { calculateFinancialHealth } from '@/lib/db/health';
import { RealHealthView } from '@/components/health/real-health-view';
import { DemoHealthView } from '@/components/health/demo-health-view';

export const metadata = {
  title: 'Financial Health — OmniScope',
};

export default async function HealthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is authenticated, derive personalized health score from real portfolio & profile
  if (user) {
    const summary = await getPersonalFinancialSummary(user.id);
    const assessment = calculateFinancialHealth(summary);

    return <RealHealthView assessment={assessment} summary={summary} />;
  }

  // Fallback to reference demo experience for unauthenticated visitors
  return <DemoHealthView />;
}
