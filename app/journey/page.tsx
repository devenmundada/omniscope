import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { computeJourney } from '@/lib/math/wealth-dna';
import { wealthJourneyMilestones } from '@/lib/data';
import { WealthJourneyView } from '@/components/journey/wealth-journey-view';

export const metadata = { title: 'Wealth Journey — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function WealthJourneyPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const s = await loadFinancialSnapshot(user.id);
      const milestones = computeJourney(s);
      if (milestones.length > 0) {
        return (
          <WealthJourneyView
            milestones={milestones}
            banner={{ tone: 'real', text: 'Rebuilt from your purchase dates, verified daily prices and goals. Add first-purchase dates to holdings for a more accurate timeline.' }}
          />
        );
      }
      return (
        <WealthJourneyView
          milestones={wealthJourneyMilestones}
          banner={{ tone: 'demo', text: 'Add holdings to start your own journey. Showing a sample journey for now.' }}
        />
      );
    }
  }
  return <WealthJourneyView milestones={wealthJourneyMilestones} banner={{ tone: 'demo', text: 'Sample data. Sign in to see your own journey.' }} />;
}
