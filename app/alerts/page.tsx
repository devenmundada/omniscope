import { redirect } from 'next/navigation';
import { AlertsView } from '@/components/alerts/alerts-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getAlerts } from '@/lib/db/alerts';

export const metadata = { title: 'Alerts — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  if (!isSupabaseConfigured()) redirect('/welcome');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=%2Falerts');
  const { alerts, asOf } = await getAlerts(user.id);
  return <AlertsView alerts={alerts} asOf={asOf} />;
}
