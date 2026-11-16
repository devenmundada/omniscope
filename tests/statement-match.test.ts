import { describe, expect, it } from 'vitest';
import { matchToCatalogue, statementSchema, type ExtractedStatement } from '@/lib/ai/statement-match';
import type { Instrument } from '@/lib/db/schema';

const inst = (symbol: string, name: string, isin: string | null, assetClass: string) =>
  ({ id: symbol, symbol, name, isin, assetClass }) as unknown as Instrument;

const catalogue = [
  inst('INFY', 'Infosys Ltd', 'INE009A01021', 'Indian Stocks'),
  inst('ICICIBANK', 'ICICI Bank Ltd', 'INE090A01021', 'Indian Stocks'),
  inst('PPFAS-FC', 'Parag Parikh Flexi Cap Fund', 'INF879O01027', 'Mutual Funds'),
  inst('NIFTYBEES', 'Nippon India ETF Nifty 50 BeES', 'INF204KB14I2', 'ETFs'),
];

const h = (o: Partial<ExtractedStatement['holdings'][number]>) => ({
  securityName: 'x', isin: null, symbol: null, assetType: 'equity' as const, quantity: 10,
  averageCost: null, totalCost: null, purchaseDate: null, accountLabel: null, ...o,
});

describe('matchToCatalogue', () => {
  it('matches by ISIN first, then symbol, then name', () => {
    const rows = matchToCatalogue(
      {
        statementType: 'Holdings', statementDate: null, investorFirstName: null,
        holdings: [
          h({ securityName: 'Infosys Limited', isin: 'ine009a01021', averageCost: 1462.4 }),
          h({ securityName: 'ICICI', symbol: 'ICICIBANK.NS', totalCost: 56925, quantity: 60 }),
          h({ securityName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', assetType: 'mutual_fund', quantity: 612.384, averageCost: 64.12 }),
          h({ securityName: 'Some Unknown Smallcap Ltd', quantity: 5, averageCost: 10 }),
        ],
      },
      catalogue
    );
    expect(rows.map((r) => r.matchMethod)).toEqual(['isin', 'symbol', 'name', 'none']);
    expect(rows[0].matched?.symbol).toBe('INFY');
    expect(rows[1].averageCost).toBeCloseTo(948.75, 2); // derived from total cost / quantity
    expect(rows[2].matched?.symbol).toBe('PPFAS-FC');
    expect(rows[2].accountName).toBe('Mutual Fund Folio');
    expect(rows[3].matched).toBeNull();
  });

  it('drops zero or negative quantities and normalises dates', () => {
    const rows = matchToCatalogue(
      { statementType: 's', statementDate: null, investorFirstName: null,
        holdings: [h({ quantity: 0 }), h({ securityName: 'Infosys', isin: 'INE009A01021', purchaseDate: '2023-07-12' })] },
      catalogue
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].purchaseDate).toBe('2023-07-12');
  });

  it('schema rejects malformed model output', () => {
    expect(statementSchema.safeParse({ statementType: 'x', holdings: [{ securityName: 'a' }] }).success).toBe(false);
  });
});
