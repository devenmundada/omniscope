import { DemoDashboard } from '@/components/dashboard/demo-dashboard';

export const metadata = { title: 'Sample dashboard — OmniScope' };

/** The dashboard with a built-in sample portfolio, for visitors who have not signed up yet. */
export default function DemoPage() {
  return <DemoDashboard />;
}
