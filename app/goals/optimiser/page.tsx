import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { GoalOptimizerView } from '@/components/goals/goal-optimizer-view';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getGoalOptimizerData } from '@/lib/db/goal-optimizer';

export const metadata = { title: 'Goal-based optimiser — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function GoalOptimizerPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const data = await getGoalOptimizerData(user.id);
      if (data) return <GoalOptimizerView data={data} />;
    }
  }
  return (
    <div>
      <PageHeader eyebrow="Goal-based optimiser" title="Which mix gives your goals the best chance?" question="Needs goals and holdings with verified price history." />
      <Card className="max-w-xl p-6 text-sm text-muted-foreground">
        Add holdings on the <Link href="/portfolio" className="font-medium text-primary hover:underline">Portfolio page</Link> and goals on the{' '}
        <Link href="/goals" className="font-medium text-primary hover:underline">Goals page</Link> first.
      </Card>
    </div>
  );
}
