import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { RebalancerView } from '@/components/rebalance/rebalancer-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getRebalanceData } from '@/lib/db/rebalance';
import type { RebalanceTarget } from '@/lib/math/rebalance-plan';

export const metadata = { title: 'Tax-smart Rebalancer — OmniScope' };
export const dynamic = 'force-dynamic';

const TARGETS: RebalanceTarget[] = ['maxSharpe', 'minVariance', 'sameRisk'];

export default async function RebalancePage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const { target } = await searchParams;
  const initial = TARGETS.includes(target as RebalanceTarget) ? (target as RebalanceTarget) : 'maxSharpe';
  let signedIn = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const data = await getRebalanceData(user.id);
      if (data) return <RebalancerView data={data} initialTarget={initial} />;
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="Tax-smart Rebalancer"
        title="Fix your mix without a needless tax bill."
        question="Works out the cheapest way to move your portfolio to an optimised mix, lot by lot, under Indian capital-gains rules."
      />
      <Card className="max-w-xl p-6 text-sm text-muted-foreground">
        {signedIn ? (
          <>
            The rebalancer needs at least two holdings with verified prices and history. Add them on the{' '}
            <Link href="/portfolio" className="font-medium text-primary hover:underline">Portfolio page</Link>.
          </>
        ) : (
          <>
            <Link href="/auth/login?next=%2Frebalance" className="font-medium text-primary hover:underline">Sign in</Link> to plan a tax-smart rebalance of your portfolio.
          </>
        )}
      </Card>
    </div>
  );
}
