import Link from 'next/link';
import { ExternalLink, Info, Newspaper, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MentorNotes } from '@/components/omni/mentor-notes';
import { getMarketIntelligence, type HoldingIntel } from '@/lib/ai/market-intel';
import type { FinancialSnapshot } from '@/lib/ai/snapshot';
import { cn } from '@/lib/utils';
import { RefreshIntelButton } from './refresh-intel-button';

const SENTIMENT: Record<string, { label: string; cls: string }> = {
  positive: { label: 'Positive', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  neutral: { label: 'Neutral', cls: 'bg-muted text-foreground' },
  negative: { label: 'Negative', cls: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300' },
};

const ago = (iso: string | null) => {
  if (!iso) return '';
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export async function MarketStory({ userId, snapshot }: { userId: string; snapshot: FinancialSnapshot }) {
  const intel = await getMarketIntelligence(userId, snapshot);
  const { story } = intel;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Today&apos;s Financial Story</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {story.headline}
            <span className="mx-2 text-border">·</span>
            {intel.aiGenerated ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5 text-primary" aria-hidden /> AI analysis of your holdings and today&apos;s headlines ({intel.model})
              </span>
            ) : (
              'Computed from your verified prices'
            )}
          </p>
        </div>
        <RefreshIntelButton />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Block title="What Happened" body={story.whatHappened} />
          <Block title="Why It Happened" body={story.whyItHappened} />
          <Block title="Does It Matter?" body={story.doesItMatter} />
          <div className="pt-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
              <Info className="size-4" aria-hidden />
              {story.action}
            </span>
          </div>
        </div>
        <div className="space-y-4">
          <MentorNotes title="Educational Takeaway" content={story.educationalTakeaway} confidence={story.confidence} actionable />
          {story.sources.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources used</p>
              <ul className="space-y-1.5">
                {story.sources.map((n) => (
                  <li key={n.id} className="text-sm">
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {n.title}
                    </a>
                    <span className="ml-1 text-xs text-muted-foreground">— {n.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {intel.holdings.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Newspaper className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your holdings in the news</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {intel.holdings.map((h) => (
              <HoldingNewsCard key={h.symbol} h={h} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Headlines from Google News (last 7 days). Sentiment is an AI reading of the headlines, not investment advice.{' '}
            <Link href="/mentor" className="text-primary hover:underline">
              Ask the AI Copilot
            </Link>{' '}
            for detail.
          </p>
        </section>
      )}
    </>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="text-base leading-relaxed text-foreground">{body}</p>
    </div>
  );
}

export function HoldingNewsCard({ h }: { h: HoldingIntel }) {
  const s = h.sentiment ? SENTIMENT[h.sentiment] : null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{h.symbol}</p>
          <p className="text-xs text-muted-foreground">
            {h.weightPct != null ? `${h.weightPct.toFixed(1)}% of portfolio` : h.assetClass}
            {h.dayChangePct != null && (
              <span className={cn('ml-2 tnum', h.dayChangePct >= 0 ? 'text-success' : 'text-danger')}>
                {h.dayChangePct >= 0 ? '+' : ''}
                {h.dayChangePct.toFixed(2)}% today
              </span>
            )}
          </p>
        </div>
        {s && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}{h.impact ? ` · ${h.impact} impact` : ''}</span>}
      </div>
      {h.summary && <p className="text-sm text-foreground">{h.summary}</p>}
      {h.news.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border pt-2">
          {h.news.slice(0, 3).map((n) => (
            <li key={n.id} className="text-xs">
              <a href={n.link} target="_blank" rel="noopener noreferrer" className="group inline-flex gap-1 text-foreground hover:underline">
                <span className="line-clamp-2">{n.title}</span>
                <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
              </a>
              <span className="text-muted-foreground">
                {n.source}
                {n.publishedAt ? ` · ${ago(n.publishedAt)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No headlines in the last 7 days.</p>
      )}
    </Card>
  );
}

export function MarketStorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading today's financial story">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">Today&apos;s Financial Story</h1>
      <p className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="size-3.5 animate-pulse text-primary" aria-hidden /> Reading today&apos;s headlines for your holdings…
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
