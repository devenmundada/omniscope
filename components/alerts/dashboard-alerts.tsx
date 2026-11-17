import 'server-only';
import type { FinancialSnapshot } from '@/lib/ai/snapshot';
import { getAlerts } from '@/lib/db/alerts';
import { AlertStrip } from './alert-strip';

export async function DashboardAlerts({ userId, snapshot }: { userId: string; snapshot: FinancialSnapshot }) {
  const result = await getAlerts(userId, snapshot).catch(() => null);
  if (!result) return null;
  return <AlertStrip alerts={result.alerts} />;
}
