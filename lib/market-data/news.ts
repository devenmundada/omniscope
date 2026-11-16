import 'server-only';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

/** Parses a Google News RSS document into items. Exported for tests. */
export function parseRss(xml: string, limit = 5, idPrefix = 'n'): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, limit).map((block, i) => {
    const source = tag(block, 'source');
    let title = tag(block, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const pub = tag(block, 'pubDate');
    return {
      id: `${idPrefix}${i}`,
      title,
      link: tag(block, 'link'),
      source: source || 'Google News',
      publishedAt: pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null,
    };
  });
}

/**
 * Free headline feed: Google News RSS search, India edition, last 7 days.
 * Headlines and links only; articles are never copied.
 */
export async function fetchNews(query: string, limit = 5, idPrefix = 'n'): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmniScope/1.0)' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`News feed HTTP ${res.status}`);
  return parseRss(await res.text(), limit, idPrefix);
}

/** Search phrase for a holding: company name without suffixes, plus "share" or "fund". */
export function newsQueryFor(h: { name: string; assetClass: string }): string {
  const base = h.name
    .split(' - ')[0]
    .replace(/\b(ltd|limited|direct|plan|growth|option|regular)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (h.assetClass === 'Mutual Funds') return `"${base}"`;
  if (h.assetClass === 'Gold') return 'gold price India';
  if (h.assetClass === 'ETFs') return /gold/i.test(base) ? 'gold price India' : /bank/i.test(base) ? 'Bank Nifty' : 'Nifty 50';
  return `"${base}" share`;
}
