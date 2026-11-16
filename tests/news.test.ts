import { describe, expect, it } from 'vitest';
import { parseRss, newsQueryFor } from '@/lib/market-data/news';

const xml = `<rss><channel><item><title>Jefferies reiterates Hold on Infosys - Investing.com India</title><link>https://news.google.com/rss/articles/abc?oc=5</link><pubDate>Wed, 11 Nov 2026 15:06:31 GMT</pubDate><source url="https://in.investing.com">Investing.com India</source></item><item><title>Q2 results &amp; outlook - Mint</title><link>https://n/2</link><pubDate>bad</pubDate><source url="u">Mint</source></item></channel></rss>`;

describe('Google News RSS', () => {
  it('parses items, strips the source suffix and decodes entities', () => {
    const items = parseRss(xml, 5, 'h0-');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'h0-0', title: 'Jefferies reiterates Hold on Infosys', source: 'Investing.com India' });
    expect(items[0].publishedAt).toBe('2026-11-11T15:06:31.000Z');
    expect(items[1].title).toBe('Q2 results & outlook');
    expect(items[1].publishedAt).toBeNull();
  });

  it('builds sensible search phrases', () => {
    expect(newsQueryFor({ name: 'Infosys Ltd', assetClass: 'Indian Stocks' })).toBe('"Infosys" share');
    expect(newsQueryFor({ name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', assetClass: 'Mutual Funds' })).toBe('"Parag Parikh Flexi Cap Fund"');
    expect(newsQueryFor({ name: 'Nippon India ETF Gold BeES', assetClass: 'ETFs' })).toBe('gold price India');
  });
});
