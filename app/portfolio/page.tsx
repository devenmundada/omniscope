import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { MentorNotes } from '@/components/omni/mentor-notes';
import { RealHoldingsView } from '@/components/portfolio/real-holdings-view';
import {
  getUserHoldings,
  getUserAccounts,
  getInstrumentsCatalog,
  calculatePortfolioSummary,
  ensureDefaultAccount,
} from '@/lib/db/portfolio';
import { formatINRCompact } from '@/lib/format';

export const metadata = {
  title: 'Portfolio — OmniScope',
};

// Allow the in-page "Sync Prices" server action enough time for price + history sync.
export const maxDuration = 60;

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/portfolio');
  }

  // Ensure user has at least one account configured
  await ensureDefaultAccount(user.id);

  // Fetch real user data directly from Supabase PostgreSQL via Drizzle
  const [holdings, accounts, instruments] = await Promise.all([
    getUserHoldings(user.id),
    getUserAccounts(user.id),
    getInstrumentsCatalog(),
  ]);

  const summary = calculatePortfolioSummary(holdings);

  let mentorContent =
    'Welcome to your OmniScope portfolio. Your database partition is ready. Add your holdings manually or import a CSV statement to begin tracking your true cost basis and asset allocation.';

  if (holdings.length > 0) {
    if (summary.hasAnyPricedHoldings && summary.totalCurrentValue != null) {
      const gainText =
        summary.totalUnrealizedGain != null
          ? `${summary.totalUnrealizedGain >= 0 ? '+' : ''}${formatINRCompact(
              summary.totalUnrealizedGain
            )} (${summary.totalUnrealizedGain >= 0 ? '+' : ''}${(
              summary.totalUnrealizedGainPct ?? 0
            ).toFixed(2)}%)`
          : '';
      mentorContent = `You have ${holdings.length} active positions totaling ${formatINRCompact(
        summary.totalInvested
      )} in cost basis, currently valued at ${formatINRCompact(
        summary.totalCurrentValue
      )} (${gainText} unrealized P&L) across ${accounts.length} ${
        accounts.length === 1 ? 'account' : 'accounts'
      }. Valuations are verified against official AMFI NAVs and closing feeds.`;
    } else {
      mentorContent = `You have ${holdings.length} active positions totaling ${formatINRCompact(
        summary.totalInvested
      )} in verified cost basis across ${accounts.length} ${
        accounts.length === 1 ? 'account' : 'accounts'
      }. Synchronize market data feeds to view verified daily valuations and returns.`;
    }
  }

  return (
    <StaggerContainer>
      <StaggerItem>
        <PageHeader
          eyebrow="Portfolio"
          title="What do you own?"
          question="Every holding across stocks, funds, gold and fixed income — in one honest, verified list."
        />
      </StaggerItem>

      <StaggerItem>
        <MentorNotes
          title="AI Perspective"
          content={mentorContent}
          confidence={holdings.length > 0 ? 'High' : 'Medium'}
          actionable
        />
      </StaggerItem>

      <StaggerItem>
        <RealHoldingsView
          initialHoldings={holdings}
          initialAccounts={accounts}
          instruments={instruments}
          initialSummary={summary}
        />
      </StaggerItem>
    </StaggerContainer>
  );
}
