import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { buildFutureScenarios } from '@/lib/math/future-self';
import { futureSelfScenarios } from '@/lib/data';
import { FutureSelfView } from '@/components/future/future-self-view';

export const metadata = { title: 'Future Self — OmniScope' };
export const dynamic = 'force-dynamic';

export default async function FutureSelfPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const s = await loadFinancialSnapshot(user.id);
      const corpus = s.summary.portfolioSummary.totalCurrentValue ?? s.summary.portfolioSummary.totalInvested;
      const sip = s.summary.goalsSummary.totalMonthlyCommitment;
      if (corpus > 0 || sip > 0) {
        const scenarios = buildFutureScenarios({
          startCorpus: corpus,
          monthlyInvestment: sip,
          annualReturn: s.assumptions.annualReturn,
          monthlySurplus: s.summary.cashFlow.netSurplus,
        });
        return (
          <FutureSelfView
            scenarios={scenarios}
            banner={{
              tone: 'real',
              text: `Personalised from your verified portfolio, your goal SIPs (₹${Math.round(sip).toLocaleString('en-IN')}/month) and a ${(s.assumptions.annualReturn * 100).toFixed(1)}% return estimated from your holdings' history.`,
            }}
          />
        );
      }
      return (
        <FutureSelfView
          scenarios={futureSelfScenarios}
          banner={{ tone: 'demo', text: 'Add holdings and goals to personalise these paths. Showing sample scenarios for now.' }}
        />
      );
    }
  }
  return (
    <FutureSelfView
      scenarios={futureSelfScenarios}
      banner={{ tone: 'demo', text: 'Sample data. Sign in to project your own portfolio and SIPs.' }}
    />
  );
}
