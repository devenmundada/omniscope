import { z } from 'zod';
import type { Instrument } from '@/lib/db/schema';

export const extractedHoldingSchema = z.object({
  securityName: z.string().describe('Security or scheme name exactly as printed'),
  isin: z.string().nullable().describe('12-character ISIN if printed, else null'),
  symbol: z.string().nullable().describe('Exchange ticker if printed, else null'),
  assetType: z.enum(['equity', 'mutual_fund', 'etf', 'gold_bond', 'bond', 'other']),
  quantity: z.number().describe('Units or shares held'),
  averageCost: z.number().nullable().describe('Average purchase price per unit in INR if printed'),
  totalCost: z.number().nullable().describe('Total invested / cost value in INR if printed'),
  purchaseDate: z.string().nullable().describe('First purchase date as YYYY-MM-DD if printed'),
  accountLabel: z.string().nullable().describe('Broker, depository account or folio label the holding sits in'),
});

export const statementSchema = z.object({
  statementType: z.string().describe('e.g. "Consolidated Account Statement", "Broker holdings statement"'),
  statementDate: z.string().nullable(),
  investorFirstName: z.string().nullable().describe('Only the first name, for display; never return PAN or account numbers'),
  holdings: z.array(extractedHoldingSchema),
});

export type ExtractedStatement = z.infer<typeof statementSchema>;

export interface ReviewRow {
  key: string;
  extractedName: string;
  matched: { symbol: string; name: string; isin: string | null; assetClass: string } | null;
  matchMethod: 'isin' | 'symbol' | 'name' | 'none';
  quantity: number;
  averageCost: number | null;
  purchaseDate: string | null;
  accountName: string;
}

const STOP = new Set(['ltd', 'limited', 'fund', 'plan', 'direct', 'growth', 'option', 'the', 'of', 'and', 'india', 'scheme', 'regular', '-', '&']);
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));

function nameScore(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

/** Maps each extracted holding to the verified securities catalogue (ISIN → symbol → fuzzy name). */
export function matchToCatalogue(extracted: ExtractedStatement, catalogue: Instrument[]): ReviewRow[] {
  return extracted.holdings
    .filter((h) => Number.isFinite(h.quantity) && h.quantity > 0)
    .map((h, i) => {
      let inst: Instrument | undefined;
      let method: ReviewRow['matchMethod'] = 'none';
      const isin = h.isin?.trim().toUpperCase();
      if (isin) { inst = catalogue.find((c) => c.isin?.toUpperCase() === isin); if (inst) method = 'isin'; }
      if (!inst && h.symbol) {
        const sym = h.symbol.trim().toUpperCase().replace(/\.NS$|\.BO$/, '');
        inst = catalogue.find((c) => c.symbol.toUpperCase() === sym);
        if (inst) method = 'symbol';
      }
      if (!inst) {
        let best: { c: Instrument; s: number } | null = null;
        for (const c of catalogue) {
          const s = nameScore(h.securityName, c.name);
          if (!best || s > best.s) best = { c, s };
        }
        if (best && best.s >= 0.5) { inst = best.c; method = 'name'; }
      }
      const avg = h.averageCost ?? (h.totalCost != null && h.quantity > 0 ? h.totalCost / h.quantity : null);
      const date = h.purchaseDate && !Number.isNaN(Date.parse(h.purchaseDate)) ? new Date(h.purchaseDate).toISOString().slice(0, 10) : null;
      const defaultAccount = h.assetType === 'mutual_fund' ? 'Mutual Fund Folio' : 'Demat Account';
      return {
        key: `${i}-${h.securityName}`,
        extractedName: h.securityName,
        matched: inst ? { symbol: inst.symbol, name: inst.name, isin: inst.isin, assetClass: inst.assetClass } : null,
        matchMethod: method,
        quantity: h.quantity,
        averageCost: avg != null && Number.isFinite(avg) ? Math.round(avg * 100) / 100 : null,
        purchaseDate: date,
        accountName: (h.accountLabel?.trim() || defaultAccount).slice(0, 60),
      };
    });
}

