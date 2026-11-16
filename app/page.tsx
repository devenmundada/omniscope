import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { RealDashboard } from '@/components/dashboard/real-dashboard';
import { DemoDashboard } from '@/components/dashboard/demo-dashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function DashboardPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const snapshot = await loadFinancialSnapshot(user.id);
      return <RealDashboard userId={user.id} snapshot={snapshot} />;
    }
    // Visitors who are not signed in get the public landing page.
    redirect('/welcome');
  }
  return <DemoDashboard />;
}
