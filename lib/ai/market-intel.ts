import 'server-only';
import { createHash } from 'crypto';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiInsightCache } from '@/lib/db/schema';
import { fetchNews, newsQueryFor, type NewsItem } from '@/lib/market-data/news';
import { istDate } from '@/lib/market-data/history';
import { isAiConfigured, withModelFallback } from './model';
import type { FinancialSnapshot } from './snapshot';
import { logger } from '@/lib/logger';

const intelSchema = z.object({
  story: z.object({
    headline: z.string().describe('One line, under 12 words'),
    whatHappened: z.string().describe('2 sentences on what moved in THIS portfolio today, with ₹ and % from the facts'),
    whyItHappened: z.string().describe('2 sentences linking moves to the supplied headlines; say so if no headline explains it'),
    doesItMatter: z.string().describe('2 sentences putting it in the context of long-term goals and diversification'),
    action: z.string().describe('One short, non-advisory next step inside the app, e.g. "Review concentration in X-Ray"'),
    educationalTakeaway: z.string().describe('One concept a beginner investor learns from today'),
    confidence: z.enum(['High', 'Medium', 'Low']),
    citedNewsIds: z.array(z.string()),
  }),
  holdings: z.array(
    z.object({
      symbol: z.string(),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      impact: z.enum(['high', 'medium', 'low']),
      summary: z.string().describe('One sentence in plain English on what the headlines mean for this holding'),
      newsIds: z.array(z.string()),
    })
  ),
});

export interface HoldingIntel {
  symbol: string;
  name: string;
  assetClass: string;
  weightPct: number | null;
  dayChangePct: number | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  impact: 'high' | 'medium' | 'low' | null;
  summary: string | null;
  news: NewsItem[];
}

export interface MarketIntelligence {
  generatedAt: string;
  asOf: string;
  aiGenerated: boolean;
  model: string | null;
  facts: {
    portfolioValue: number | null;
    dayChangeValue: number | null;
    dayChangePct: number | null;
    topGainer: { symbol: string; pct: number } | null;
    topLoser: { symbol: string; pct: number } | null;
  };
  story: {
    headline: string;
    whatHappened: string;
    whyItHappened: string;
    doesItMatter: string;
    action: string;
    educationalTakeaway: string;
    confidence: 'High' | 'Medium' | 'Low';
    sources: NewsItem[];
  };
  holdings: HoldingIntel[];
  marketNews: NewsItem[];
}

const TTL_MS = 6 * 60 * 60 * 1000;
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtINR = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

function computeFacts(s: FinancialSnapshot) {
  const priced = s.summary.holdings.filter((h) => h.currentValue != null);
  const total = priced.reduce((a, h) => a + (h.currentValue ?? 0), 0);
  let change = 0;
  let any = false;
  for (const h of priced) {
    if (h.dayChangePct == null || !Number.isFinite(h.dayChangePct)) continue;
    any = true;
    const v = h.currentValue ?? 0;
    change += v - v / (1 + h.dayChangePct / 100);
  }
  const movers = priced.filter((h) => h.dayChangePct != null).sort((a, b) => (b.dayChangePct ?? 0) - (a.dayChangePct ?? 0));
  const top = movers[0];
  const bottom = movers[movers.length - 1];
  return {
    portfolioValue: priced.length ? total : null,
    dayChangeValue: any ? change : null,
    dayChangePct: any && total - change > 0 ? (change / (total - change)) * 100 : null,
    topGainer: top && (top.dayChangePct ?? 0) > 0 ? { symbol: top.symbol, pct: top.dayChangePct! } : null,
    topLoser: bottom && (bottom.dayChangePct ?? 0) < 0 ? { symbol: bottom.symbol, pct: bottom.dayChangePct! } : null,
  };
}

function fallbackStory(facts: ReturnType<typeof computeFacts>, s: FinancialSnapshot): MarketIntelligence['story'] {
  const dc = facts.dayChangeValue;
  const what =
    dc == null
      ? 'Daily price changes are not available yet for your holdings. Run "Sync Prices" on the Portfolio page to fetch the latest end-of-day prices.'
      : `Your verified portfolio ${dc >= 0 ? 'rose' : 'fell'} by about ${fmtINR(dc)} (${fmtPct(facts.dayChangePct ?? 0)}) on the latest trading day.` +
        (facts.topGainer ? ` ${facts.topGainer.symbol} led with ${fmtPct(facts.topGainer.pct)}.` : '') +
        (facts.topLoser ? ` ${facts.topLoser.symbol} lagged at ${fmtPct(facts.topLoser.pct)}.` : '');
  const score = s.health.overallScore;
  return {
    headline: dc == null ? 'Your portfolio at a glance' : `Portfolio ${dc >= 0 ? 'up' : 'down'} ${fmtPct(facts.dayChangePct ?? 0)} today`,
    whatHappened: what,
    whyItHappened: 'AI summaries are switched off, so the headlines below are shown without interpretation.',
    doesItMatter:
      'A single day rarely changes a long-term plan. What matters more is whether your allocation and monthly investing keep your goals on track.' +
      (score != null ? ` Your Financial Health Score is ${score}/100.` : ''),
    action: 'Review your goal probabilities on the Goals page',
    educationalTakeaway: 'Daily volatility is normal; long-term outcomes depend mostly on time in the market and savings rate.',
    confidence: 'Medium',
    sources: [],
  };
}

async function readCache(userId: string, key: string): Promise<MarketIntelligence | null> {
  try {
    const [row] = await db
      .select()
      .from(aiInsightCache)
      .where(
        and(
          eq(aiInsightCache.userId, userId),
          eq(aiInsightCache.kind, 'market_intel'),
          eq(aiInsightCache.cacheKey, key),
          gt(aiInsightCache.expiresAt, new Date())
        )
      )
      .limit(1);
    return row ? (row.content as unknown as MarketIntelligence) : null;
  } catch (e) {
    logger.warn('market intel cache read failed', e instanceof Error ? e.message : e);
    return null;
  }
}

async function writeCache(userId: string, key: string, value: MarketIntelligence) {
  try {
    const expiresAt = new Date(Date.now() + TTL_MS);
    await db
      .insert(aiInsightCache)
      .values({ userId, kind: 'market_intel', cacheKey: key, content: value as unknown as Record<string, unknown>, model: value.model, expiresAt })
      .onConflictDoUpdate({
        target: [aiInsightCache.userId, aiInsightCache.kind, aiInsightCache.cacheKey],
        set: { content: value as unknown as Record<string, unknown>, model: value.model, expiresAt, createdAt: new Date() },
      });
  } catch (e) {
    logger.warn('market intel cache write failed', e instanceof Error ? e.message : e);
  }
}

/**
 * Daily AI market intelligence for one user: free Google News headlines for their largest holdings,
 * summarised by Gemini into per-holding sentiment and a "Today's Financial Story" grounded in the
 * user's verified numbers. Cached per user per day for six hours.
 */
export async function getMarketIntelligence(userId: string, s: FinancialSnapshot, opts: { force?: boolean } = {}): Promise<MarketIntelligence> {
  const total = s.summary.portfolioSummary.totalCurrentValue ?? 0;
  const ranked = [...s.summary.holdings]
    .sort((a, b) => (b.currentValue ?? b.investedAmount) - (a.currentValue ?? a.investedAmount))
    .slice(0, 6);
  const facts = computeFacts(s);
  const asOf = istDate(new Date());
  const key = createHash('sha1')
    .update(`${asOf}|${ranked.map((h) => `${h.symbol}:${h.dayChangePct ?? ''}`).join(',')}|${isAiConfigured()}`)
    .digest('hex')
    .slice(0, 20);

  if (!opts.force) {
    const cached = await readCache(userId, key);
    if (cached) return cached;
  }

  // Fetch headlines (deduplicated by query) in parallel.
  const queries = new Map<string, string>();
  ranked.forEach((h) => queries.set(h.symbol, newsQueryFor(h)));
  const unique = [...new Set(queries.values())];
  const results = await Promise.all(
    unique.map((q, qi) => fetchNews(q, 4, `h${qi}-`).catch(() => [] as NewsItem[]))
  );
  const byQuery = new Map(unique.map((q, i) => [q, results[i]]));
  const marketNews = await fetchNews('Sensex Nifty stock market today', 5, 'm-').catch(() => [] as NewsItem[]);

  const holdings: HoldingIntel[] = ranked.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    assetClass: h.assetClass,
    weightPct: h.currentValue != null && total > 0 ? (h.currentValue / total) * 100 : null,
    dayChangePct: h.dayChangePct,
    sentiment: null,
    impact: null,
    summary: null,
    news: byQuery.get(queries.get(h.symbol)!) ?? [],
  }));

  const allNews = new Map<string, NewsItem>();
  for (const n of [...marketNews, ...results.flat()]) allNews.set(n.id, n);

  let story = fallbackStory(facts, s);
  let model: string | null = null;
  let aiGenerated = false;

  if (isAiConfigured() && (allNews.size > 0 || facts.dayChangeValue != null)) {
    const input = {
      asOfDate: asOf,
      portfolio: {
        verifiedValueINR: facts.portfolioValue != null ? Math.round(facts.portfolioValue) : null,
        dayChangeINR: facts.dayChangeValue != null ? Math.round(facts.dayChangeValue) : null,
        dayChangePct: facts.dayChangePct != null ? Math.round(facts.dayChangePct * 100) / 100 : null,
        xirrPct: s.performance?.xirrPct != null ? Math.round(s.performance.xirrPct * 10) / 10 : null,
        healthScore: s.health.overallScore,
        goals: s.summary.goalsSummary.projections.map((p, i) => ({
          name: p.goal.name,
          probabilityOfSuccessPct:
            s.goalSimulations[i]?.simulation != null ? Math.round(s.goalSimulations[i].simulation!.nominal.probabilityOfSuccess * 100) : null,
        })),
      },
      holdings: holdings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        assetClass: h.assetClass,
        weightPct: h.weightPct != null ? Math.round(h.weightPct * 10) / 10 : null,
        dayChangePct: h.dayChangePct,
        headlines: h.news.map((n) => ({ id: n.id, title: n.title, source: n.source, publishedAt: n.publishedAt })),
      })),
      marketHeadlines: marketNews.map((n) => ({ id: n.id, title: n.title, source: n.source })),
    };

    try {
      const res = await withModelFallback(async (m, id) => {
        const out = await generateText({
          model: m,
          output: Output.object({ schema: intelSchema }),
          system:
            'You are a financial news analyst for Indian retail investors. Use ONLY the JSON facts and headlines given. ' +
            'Never invent numbers, events or prices. Cite headlines only by their given ids. Write in plain English, ' +
            'use ₹ and Indian digit grouping, avoid jargon, and never give buy/sell recommendations (SEBI guardrail). ' +
            'If no headline explains a move, say the move looks like normal market fluctuation.',
          prompt: JSON.stringify(input),
        });
        return { output: out.output, id };
      });
      const o = res.output;
      if (o) {
        model = res.id;
        aiGenerated = true;
        story = {
          ...o.story,
          sources: o.story.citedNewsIds.map((id) => allNews.get(id)).filter((n): n is NewsItem => !!n).slice(0, 4),
        };
        for (const h of holdings) {
          const a = o.holdings.find((x) => x.symbol.toUpperCase() === h.symbol.toUpperCase());
          if (!a) continue;
          h.sentiment = a.sentiment;
          h.impact = a.impact;
          h.summary = a.summary;
          const cited = a.newsIds.map((id) => allNews.get(id)).filter((n): n is NewsItem => !!n);
          if (cited.length) h.news = [...cited, ...h.news.filter((n) => !cited.includes(n))].slice(0, 4);
        }
      }
    } catch (e) {
      logger.error('Market intelligence AI step failed:', e instanceof Error ? e.message : e);
    }
  }

  const value: MarketIntelligence = {
    generatedAt: new Date().toISOString(),
    asOf,
    aiGenerated,
    model,
    facts,
    story,
    holdings,
    marketNews,
  };
  if (allNews.size > 0 || aiGenerated) await writeCache(userId, key, value);
  return value;
}
