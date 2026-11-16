/**
 * Indian capital-gains tax estimates for individual investors (resident, FY 2026-27).
 * Pure functions: no I/O, safe on server and client.
 *
 * Rates follow the Finance (No. 2) Act 2024 (sales on or after 23 July 2024):
 *  - Listed equity shares, equity mutual funds and equity ETFs: short-term (held 12 months or
 *    less) 20% (s.111A); long-term 12.5% on gains above Rs 1.25 lakh a year (s.112A).
 *  - Other listed securities (gold ETFs, Sovereign Gold Bonds sold on the exchange): long-term after
 *    12 months at 12.5%, short-term at the slab rate.
 *  - Unlisted units such as international fund-of-funds: long-term after 24 months at 12.5%.
 *  - Debt funds bought on or after 1 April 2023: always taxed at the slab rate (s.50AA).
 *  - Sovereign Gold Bonds redeemed with RBI are exempt (s.47(viic)).
 * Health and education cess of 4% applies to the tax. Surcharge (income above Rs 50 lakh),
 * grandfathering of pre-2018 equity, and STT are not modelled.
 */

export const TAX_RULES = {
  label: 'FY 2026-27',
  equityStcgRate: 0.2,
  equityLtcgRate: 0.125,
  otherLtcgRate: 0.125,
  ltcgExemption: 125_000,
  cess: 0.04,
  listedLongTermMonths: 12,
  unlistedLongTermMonths: 24,
  debtFundCutoff: '2023-04-01',
} as const;

/** New-regime slabs (Finance Act 2025) on taxable income, and the salaried standard deduction. */
export const NEW_REGIME_SLABS: Array<[upTo: number, rate: number]> = [
  [400_000, 0],
  [800_000, 0.05],
  [1_200_000, 0.1],
  [1_600_000, 0.15],
  [2_000_000, 0.2],
  [2_400_000, 0.25],
  [Infinity, 0.3],
];
export const STANDARD_DEDUCTION = 75_000;

/** Marginal slab rate under the new regime for an annual gross income (null if unknown). */
export function marginalSlabRate(annualIncome: number | null): number | null {
  if (annualIncome == null || !Number.isFinite(annualIncome) || annualIncome <= 0) return null;
  const taxable = Math.max(0, annualIncome - STANDARD_DEDUCTION);
  return NEW_REGIME_SLABS.find(([upTo]) => taxable <= upTo)![1];
}

export type TaxCategory = 'equity' | 'gold_etf' | 'sgb' | 'intl_fund' | 'debt_fund' | 'deposit';
export type Bucket = 'stcgEquity' | 'ltcgEquity' | 'ltcgOther' | 'slab';

export const CATEGORY_LABELS: Record<TaxCategory, string> = {
  equity: 'Listed equity / equity fund',
  gold_etf: 'Gold ETF',
  sgb: 'Sovereign Gold Bond',
  intl_fund: 'International fund-of-funds',
  debt_fund: 'Debt fund',
  deposit: 'Deposit (interest, not capital gains)',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  stcgEquity: 'Equity short-term · 20%',
  ltcgEquity: 'Equity long-term · 12.5% above ₹1.25 L',
  ltcgOther: 'Long-term · 12.5%',
  slab: 'Taxed at your slab rate',
};

/** Tax category from the catalogue's asset class, sector and name. */
export function taxCategoryFor(assetClass: string, sector: string | null, name: string): TaxCategory {
  if (assetClass === 'Gold') return 'sgb';
  if (assetClass === 'Fixed Income') return 'deposit';
  if (assetClass === 'International') return 'intl_fund';
  if (assetClass === 'ETFs' && (sector === 'Commodity' || /gold|silver/i.test(name))) return 'gold_etf';
  if (assetClass === 'Mutual Funds' && (sector === 'Debt' || /debt|liquid|gilt|bond|money market|overnight|credit risk|duration/i.test(name))) return 'debt_fund';
  return 'equity';
}

// ---------- dates (YYYY-MM-DD strings, so time zones never shift a day) ----------

function toUtc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Adds calendar months, clamping to the month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return iso(target);
}

export const daysBetween = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

/** First date on which a holding bought on `purchase` counts as held for more than `months`. */
export function longTermFrom(purchase: string, months: number): string {
  return iso(new Date(toUtc(addMonths(purchase, months)).getTime() + 86_400_000));
}

/** Indian financial year (April to March) containing `date`, e.g. "FY 2026-27". */
export function financialYear(date: string): string {
  const d = toUtc(date);
  const start = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// ---------- positions ----------

export interface TaxHoldingInput {
  id: string;
  symbol: string;
  name: string;
  category: TaxCategory;
  /** YYYY-MM-DD, or null when the purchase date is unknown. */
  purchaseDate: string | null;
  units: number;
  costPerUnit: number;
  price: number;
}

export interface TaxPosition extends TaxHoldingInput {
  invested: number;
  value: number;
  gain: number;
  term: 'short' | 'long' | null;
  longTermOn: string | null;
  daysToLongTerm: number | null;
  bucket: Bucket | null;
  /** Why the position is not part of the capital-gains estimate, if it is not. */
  excludedReason: string | null;
}

/** Classifies one holding as short- or long-term and assigns the tax bucket a sale today would fall in. */
export function classifyPosition(h: TaxHoldingInput, asOf: string): TaxPosition {
  const invested = h.units * h.costPerUnit;
  const value = h.units * h.price;
  const base = { ...h, invested, value, gain: value - invested, term: null, longTermOn: null, daysToLongTerm: null, bucket: null, excludedReason: null };
  if (h.category === 'deposit') return { ...base, excludedReason: 'Interest is taxed as income, not as capital gains' };
  if (!h.purchaseDate) return { ...base, excludedReason: 'Purchase date needed' };

  if (h.category === 'debt_fund' && h.purchaseDate >= TAX_RULES.debtFundCutoff) {
    return { ...base, term: 'short', bucket: 'slab' };
  }
  const months = h.category === 'intl_fund' || h.category === 'debt_fund' ? TAX_RULES.unlistedLongTermMonths : TAX_RULES.listedLongTermMonths;
  const longTermOn = longTermFrom(h.purchaseDate, months);
  const isLong = asOf >= longTermOn;
  const bucket: Bucket = h.category === 'equity' ? (isLong ? 'ltcgEquity' : 'stcgEquity') : isLong ? 'ltcgOther' : 'slab';
  return {
    ...base,
    term: isLong ? 'long' : 'short',
    longTermOn,
    daysToLongTerm: isLong ? 0 : daysBetween(asOf, longTermOn),
    bucket,
  };
}

// ---------- tax computation ----------

export interface TaxOptions {
  slabRate: number;
  /** Long-term equity gains already booked this financial year (uses up the exemption). */
  ltcgAlreadyBooked?: number;
}

export interface TaxBreakdown {
  /** Gains left in each bucket after losses are set off and the exemption is applied. */
  taxable: Record<Bucket, number>;
  tax: Record<Bucket, number>;
  /** Total tax including 4% cess. */
  totalTax: number;
  exemptionUsed: number;
  exemptionLeft: number;
  /** Losses that could not be set off this year (carried forward up to 8 years). */
  carryForward: { shortTerm: number; longTerm: number };
}

const zero = (): Record<Bucket, number> => ({ stcgEquity: 0, ltcgEquity: 0, ltcgOther: 0, slab: 0 });

/**
 * Tax if every given position were sold today. Losses are set off the way that minimises tax:
 * long-term losses only against long-term gains (non-exempt first); short-term losses against any
 * gain, highest rate first. The Rs 1.25 lakh exemption applies to what is left of long-term equity.
 */
export function computeTax(positions: TaxPosition[], opts: TaxOptions): TaxBreakdown {
  const gains = zero();
  let stLoss = 0;
  let ltLoss = 0;
  for (const p of positions) {
    if (!p.bucket) continue;
    if (p.gain >= 0) gains[p.bucket] += p.gain;
    else if (p.term === 'long') ltLoss += -p.gain;
    else stLoss += -p.gain;
  }
  const rate: Record<Bucket, number> = {
    stcgEquity: TAX_RULES.equityStcgRate,
    ltcgEquity: TAX_RULES.equityLtcgRate,
    ltcgOther: TAX_RULES.otherLtcgRate,
    slab: opts.slabRate,
  };
  const absorb = (bucket: Bucket, loss: number) => {
    const used = Math.min(gains[bucket], loss);
    gains[bucket] -= used;
    return loss - used;
  };
  for (const b of ['ltcgOther', 'ltcgEquity'] as Bucket[]) ltLoss = absorb(b, ltLoss);
  const stOrder: Bucket[] = (['slab', 'stcgEquity', 'ltcgOther', 'ltcgEquity'] as Bucket[]).sort((a, b) => {
    // Highest effective rate first; long-term equity last because part of it is exempt anyway.
    if (a === 'ltcgEquity') return 1;
    if (b === 'ltcgEquity') return -1;
    return rate[b] - rate[a];
  });
  for (const b of stOrder) stLoss = absorb(b, stLoss);

  const exemptionAvailable = Math.max(0, TAX_RULES.ltcgExemption - (opts.ltcgAlreadyBooked ?? 0));
  const exemptionUsed = Math.min(gains.ltcgEquity, exemptionAvailable);
  const taxable = { ...gains, ltcgEquity: gains.ltcgEquity - exemptionUsed };
  const tax = zero();
  let total = 0;
  for (const b of Object.keys(tax) as Bucket[]) {
    tax[b] = taxable[b] * rate[b] * (1 + TAX_RULES.cess);
    total += tax[b];
  }
  return {
    taxable,
    tax,
    totalTax: total,
    exemptionUsed,
    exemptionLeft: exemptionAvailable - exemptionUsed,
    carryForward: { shortTerm: stLoss, longTerm: ltLoss },
  };
}

// ---------- opportunities ----------

export interface HarvestSuggestion {
  position: TaxPosition;
  units: number;
  saleValue: number;
  gainBooked: number;
}

/**
 * Long-term gain harvesting: sell and rebuy enough long-term equity to book gains up to the unused
 * Rs 1.25 lakh exemption, tax-free. This raises the cost basis, cutting tax on a future sale.
 */
export function ltcgHarvestPlan(positions: TaxPosition[], exemptionLeft: number): { suggestions: HarvestSuggestion[]; gainBooked: number; futureTaxSaved: number } {
  let left = exemptionLeft;
  const suggestions: HarvestSuggestion[] = [];
  const candidates = positions.filter((p) => p.bucket === 'ltcgEquity' && p.gain > 0 && p.price > p.costPerUnit).sort((a, b) => b.gain - a.gain);
  for (const p of candidates) {
    if (left <= 1) break;
    const gainBooked = Math.min(p.gain, left);
    const units = Math.min(p.units, gainBooked / (p.price - p.costPerUnit));
    suggestions.push({ position: p, units, saleValue: units * p.price, gainBooked });
    left -= gainBooked;
  }
  const gainBooked = exemptionLeft - left;
  return { suggestions, gainBooked, futureTaxSaved: gainBooked * TAX_RULES.equityLtcgRate * (1 + TAX_RULES.cess) };
}

export interface WaitSuggestion {
  position: TaxPosition;
  days: number;
  taxNow: number;
  taxIfLongTerm: number;
  saving: number;
}

/** Short-term gains that turn long-term soon: how much waiting until then would save on a sale. */
export function waitToSave(positions: TaxPosition[], opts: TaxOptions, withinDays = 120): WaitSuggestion[] {
  return positions
    .filter((p) => p.term === 'short' && p.gain > 0 && p.daysToLongTerm != null && p.daysToLongTerm > 0 && p.daysToLongTerm <= withinDays)
    .map((p) => {
      const taxNow = computeTax([p], opts).totalTax;
      const asLong: TaxPosition = { ...p, term: 'long', bucket: p.category === 'equity' ? 'ltcgEquity' : 'ltcgOther' };
      const taxIfLongTerm = computeTax([asLong], opts).totalTax;
      return { position: p, days: p.daysToLongTerm as number, taxNow, taxIfLongTerm, saving: taxNow - taxIfLongTerm };
    })
    .filter((s) => s.saving > 1)
    .sort((a, b) => b.saving - a.saving);
}

export interface LossSuggestion {
  position: TaxPosition;
  loss: number;
  /** Tax the loss could offset at the rate of the gains it can be set against. */
  taxShield: number;
}

/** Unrealised losses that could be booked to offset gains now or carry forward for 8 years. */
export function lossHarvest(positions: TaxPosition[], opts: TaxOptions): LossSuggestion[] {
  return positions
    .filter((p) => p.bucket && p.gain < 0)
    .map((p) => {
      const loss = -p.gain;
      const offsetRate = p.term === 'long' ? TAX_RULES.equityLtcgRate : Math.max(TAX_RULES.equityStcgRate, opts.slabRate);
      return { position: p, loss, taxShield: loss * offsetRate * (1 + TAX_RULES.cess) };
    })
    .sort((a, b) => b.loss - a.loss);
}
