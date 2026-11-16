import { describe, expect, it } from 'vitest';
import {
  addMonths,
  classifyPosition,
  computeTax,
  financialYear,
  longTermFrom,
  lossHarvest,
  ltcgHarvestPlan,
  marginalSlabRate,
  taxCategoryFor,
  waitToSave,
  type TaxHoldingInput,
} from '@/lib/math/tax';

const asOf = '2026-11-16';
const h = (o: Partial<TaxHoldingInput>): TaxHoldingInput => ({
  id: o.symbol ?? 'X',
  symbol: 'X',
  name: 'X',
  category: 'equity',
  purchaseDate: '2024-01-01',
  units: 100,
  costPerUnit: 100,
  price: 100,
  ...o,
});
const pos = (o: Partial<TaxHoldingInput>) => classifyPosition(h(o), asOf);

describe('dates and slabs', () => {
  it('adds months with month-end clamping and finds the long-term date', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-03-31', 12)).toBe('2026-03-31');
    // "More than 12 months": bought 16 Nov 2025, long-term from 17 Nov 2026
    expect(longTermFrom('2025-11-16', 12)).toBe('2026-11-17');
  });

  it('names the financial year', () => {
    expect(financialYear('2026-11-16')).toBe('FY 2026-27');
    expect(financialYear('2027-03-31')).toBe('FY 2026-27');
    expect(financialYear('2027-04-01')).toBe('FY 2027-28');
  });

  it('finds the new-regime marginal slab after the standard deduction', () => {
    expect(marginalSlabRate(1_440_000)).toBe(0.15); // taxable 13.65 L
    expect(marginalSlabRate(1_275_000)).toBe(0.1); // taxable exactly 12 L
    expect(marginalSlabRate(3_000_000)).toBe(0.3);
    expect(marginalSlabRate(null)).toBeNull();
  });

  it('maps catalogue instruments to tax categories', () => {
    expect(taxCategoryFor('Indian Stocks', 'Energy', 'Reliance Industries Ltd')).toBe('equity');
    expect(taxCategoryFor('ETFs', 'Index', 'Nippon India Nifty 50 BeES ETF')).toBe('equity');
    expect(taxCategoryFor('ETFs', 'Commodity', 'Nippon India ETF Gold BeES')).toBe('gold_etf');
    expect(taxCategoryFor('Gold', 'Commodity', 'Sovereign Gold Bond 2023-24 Series II')).toBe('sgb');
    expect(taxCategoryFor('International', 'US Technology', 'Motilal Oswal Nasdaq 100 FoF')).toBe('intl_fund');
    expect(taxCategoryFor('Mutual Funds', 'Flexi Cap', 'Parag Parikh Flexi Cap Fund')).toBe('equity');
    expect(taxCategoryFor('Mutual Funds', null, 'HDFC Liquid Fund')).toBe('debt_fund');
    expect(taxCategoryFor('Fixed Income', 'Debt', 'SBI Term Deposit')).toBe('deposit');
  });
});

describe('classification', () => {
  it('switches from short- to long-term the day after 12 months', () => {
    expect(classifyPosition(h({ purchaseDate: '2025-11-16' }), '2026-11-16')).toMatchObject({ term: 'short', bucket: 'stcgEquity', daysToLongTerm: 1 });
    expect(classifyPosition(h({ purchaseDate: '2025-11-16' }), '2026-11-17')).toMatchObject({ term: 'long', bucket: 'ltcgEquity', daysToLongTerm: 0 });
  });

  it('applies the 24-month rule to international funds and the slab rule to new debt funds', () => {
    expect(pos({ category: 'intl_fund', purchaseDate: '2025-01-01' })).toMatchObject({ term: 'short', bucket: 'slab' });
    expect(pos({ category: 'intl_fund', purchaseDate: '2024-01-01' })).toMatchObject({ term: 'long', bucket: 'ltcgOther' });
    expect(pos({ category: 'debt_fund', purchaseDate: '2023-06-01' })).toMatchObject({ bucket: 'slab' });
    expect(pos({ category: 'gold_etf', purchaseDate: '2024-01-01' })).toMatchObject({ bucket: 'ltcgOther' });
  });

  it('leaves out deposits and holdings without a purchase date', () => {
    expect(pos({ category: 'deposit' }).excludedReason).toMatch(/interest/i);
    expect(pos({ purchaseDate: null }).excludedReason).toBe('Purchase date needed');
  });
});

describe('tax computation', () => {
  const opts = { slabRate: 0.3 };

  it('exempts the first 1.25 lakh of long-term equity gains', () => {
    const t = computeTax([pos({ units: 100, costPerUnit: 1000, price: 3000 })], opts); // 2 L gain
    expect(t.exemptionUsed).toBe(125_000);
    expect(t.taxable.ltcgEquity).toBe(75_000);
    expect(t.totalTax).toBeCloseTo(75_000 * 0.125 * 1.04, 6);
  });

  it('reduces the exemption by gains already booked this year', () => {
    const t = computeTax([pos({ units: 100, costPerUnit: 1000, price: 3000 })], { ...opts, ltcgAlreadyBooked: 100_000 });
    expect(t.exemptionUsed).toBe(25_000);
    expect(t.taxable.ltcgEquity).toBe(175_000);
  });

  it('sets short-term losses against the highest-taxed gains first', () => {
    const t = computeTax(
      [
        pos({ symbol: 'LT', units: 100, costPerUnit: 1000, price: 3000 }), // +2 L long-term equity
        pos({ symbol: 'ST', purchaseDate: '2026-06-01', units: 100, costPerUnit: 1000, price: 1300 }), // +30 k short-term equity
        pos({ symbol: 'LOSS', purchaseDate: '2026-06-01', units: 100, costPerUnit: 1000, price: 500 }), // -50 k short-term
      ],
      { slabRate: 0.1 }
    );
    expect(t.taxable.stcgEquity).toBe(0);
    expect(t.taxable.ltcgEquity).toBe(180_000 - 125_000);
    expect(t.totalTax).toBeCloseTo(55_000 * 0.125 * 1.04, 6);
  });

  it('never sets long-term losses against short-term gains', () => {
    const t = computeTax(
      [pos({ purchaseDate: '2026-06-01', units: 100, costPerUnit: 100, price: 500 }), pos({ symbol: 'L', units: 100, costPerUnit: 500, price: 100 })],
      opts
    );
    expect(t.taxable.stcgEquity).toBe(40_000);
    expect(t.carryForward.longTerm).toBe(40_000);
    expect(t.totalTax).toBeCloseTo(40_000 * 0.2 * 1.04, 6);
  });

  it('taxes short-term gold ETF gains at the slab rate', () => {
    const t = computeTax([pos({ category: 'gold_etf', purchaseDate: '2026-06-01', units: 100, costPerUnit: 100, price: 200 })], { slabRate: 0.15 });
    expect(t.taxable.slab).toBe(10_000);
    expect(t.totalTax).toBeCloseTo(10_000 * 0.15 * 1.04, 6);
  });
});

describe('opportunities', () => {
  it('plans long-term gain harvesting up to the unused exemption', () => {
    const plan = ltcgHarvestPlan([pos({ units: 100, costPerUnit: 1000, price: 4000 })], 125_000);
    expect(plan.gainBooked).toBeCloseTo(125_000);
    expect(plan.suggestions[0].units).toBeCloseTo(125_000 / 3000, 6);
    expect(plan.suggestions[0].saleValue).toBeCloseTo((125_000 / 3000) * 4000, 4);
    expect(plan.futureTaxSaved).toBeCloseTo(125_000 * 0.125 * 1.04, 6);
  });

  it('shows what waiting for long-term status would save', () => {
    const [s] = waitToSave([classifyPosition(h({ purchaseDate: '2025-12-15', units: 100, costPerUnit: 1000, price: 2000 }), asOf)], { slabRate: 0.3 });
    expect(s.days).toBe(30);
    expect(s.taxNow).toBeCloseTo(100_000 * 0.2 * 1.04, 6);
    expect(s.taxIfLongTerm).toBe(0); // within the exemption
  });

  it('values losses at the rate of the gains they can offset', () => {
    const [l] = lossHarvest([pos({ units: 10, costPerUnit: 1000, price: 600 })], { slabRate: 0.3 });
    expect(l.loss).toBe(4000);
    expect(l.taxShield).toBeCloseTo(4000 * 0.125 * 1.04, 6);
  });
});
