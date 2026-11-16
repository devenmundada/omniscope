import { describe, expect, it } from 'vitest';
import {
  firstAvailable,
  goldPerGramInr,
  parseErApiInr,
  parseFrankfurterInr,
  parseGoldApi,
} from '@/lib/market-data/gold-debt-provider';

const now = new Date('2026-11-16T12:00:00Z');

describe('gold reference price', () => {
  it('converts USD per ounce to rupees per gram with import duty', () => {
    // 3875.47 x 94.25 / 31.1034768 x 1.06
    expect(goldPerGramInr(3875.47, 94.25)).toBe(12448.09);
  });

  it('reads gold-api.com', () => {
    const obs = parseGoldApi({ price: 3875.469971, symbol: 'XAU', updatedAt: '2026-11-16T12:23:59Z' }, now);
    expect(obs).toMatchObject({ value: 3875.469971, source: 'gold-api.com' });
    expect(obs?.ts.toISOString()).toBe('2026-11-16T12:23:59.000Z');
    expect(parseGoldApi({ price: 'n/a' }, now)).toBeNull();
    expect(parseGoldApi({ price: 3.87 }, now)).toBeNull(); // not a plausible USD/oz price
    expect(parseGoldApi(null, now)).toBeNull();
  });

  it('reads USD/INR from Frankfurter and open.er-api.com', () => {
    expect(parseFrankfurterInr({ base: 'USD', date: '2026-11-13', rates: { INR: 94.25 } }, now)?.value).toBe(94.25);
    expect(parseFrankfurterInr({ rates: { EUR: 0.86 } }, now)).toBeNull();
    const er = parseErApiInr({ result: 'success', time_last_update_unix: 1794787351, rates: { INR: 94.399626 } }, now);
    expect(er?.value).toBe(94.399626);
    expect(er?.ts.getTime()).toBe(1794787351000);
    expect(parseErApiInr({ result: 'error', rates: { INR: 94.4 } }, now)).toBeNull();
  });

  it('falls through to the next source and reports why', async () => {
    const res = await firstAvailable([
      { name: 'Yahoo', fetch: async () => { throw new Error('Yahoo HTTP 429'); } },
      { name: 'Empty', fetch: async () => null },
      { name: 'Good', fetch: async () => ({ value: 94.25, ts: now, source: 'good' }) },
      { name: 'Never called', fetch: async () => { throw new Error('should not run'); } },
    ]);
    expect(res.obs?.source).toBe('good');
    expect(res.errors).toEqual(['Yahoo: Yahoo HTTP 429', 'Empty: no usable value']);
  });
});
