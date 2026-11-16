import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { loadFinancialSnapshot } from '@/lib/ai/snapshot';
import { getMarketIntelligence } from '@/lib/ai/market-intel';
import { PageHeader } from '@/components/omni/primitives';
import { Card } from '@/components/ui/card';
import { HoldingNewsCard } from '@/components/dashboard/market-story';
import { RefreshIntelButton } from '@/components/dashboard/refresh-intel-button';
import { DemoMarketView } from '@/components/market/demo-market-view';

export const metadata = { title: 'Market Intelligence — OmniScope' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function LiveIntel({ userId }: { userId: string }) {
  const s = await loadFinancialSnapshot(userId);
  if (s.summary.holdings.length === 0) {
    return <p className="text-sm text-muted-foreground">Add holdings on the Portfolio page to get news analysis for them.</p>;
  }
  const intel = await getMarketIntelligence(userId, s);
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Market headlines</h2>
          <RefreshIntelButton />
        </div>
        <Card className="divide-y divide-border">
          {intel.marketNews.length === 0 && <p className="p-4 text-sm text-muted-foreground">No headlines available right now.</p>}
          {intel.marketNews.map((n) => (
            <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-accent/50">
              <p className="text-sm font-medium text-foreground">{n.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.source}
                {n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </a>
          ))}
        </Card>
        <Card className="mt-4 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today for you</p>
          <p className="mt-2 text-sm text-foreground">{intel.story.whatHappened}</p>
          <p className="mt-2 text-sm text-muted-foreground">{intel.story.whyItHappened}</p>
        </Card>
      </section>
      <section className="lg:col-span-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Impact on your holdings</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {intel.holdings.map((h) => (
            <HoldingNewsCard key={h.symbol} h={h} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {intel.aiGenerated ? `Sentiment and summaries by ${intel.model}. ` : 'AI summaries are off; raw headlines shown. '}
          Headlines from Google News, last 7 days. Educational only, not investment advice.
        </p>
      </section>
    </div>
  );
}

export default async function MarketIntelligencePage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return (
        <div>
          <PageHeader
            eyebrow="Market Intelligence"
            title="Why does this matter to me?"
            question="Live headlines for the holdings you own, with an AI reading of what each one means for you."
          />
          <Suspense fallback={<p className="animate-pulse text-sm text-muted-foreground">Reading today&apos;s headlines for your holdings…</p>}>
            <LiveIntel userId={user.id} />
          </Suspense>
        </div>
      );
    }
  }
  return <DemoMarketView />;
}
