import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from './index';
import { financialProfiles, holdings } from './schema';
import { getUserHoldings } from './portfolio';
import { classifyPosition, computeTax, financialYear, marginalSlabRate, taxCategoryFor, type Bucket, type TaxHoldingInput } from '@/lib/math/tax';
import { buildLots } from '@/lib/math/lots';
import { getUserLedger, ledgerKey } from './transactions';

export interface TaxCentreData {
  asOf: string;
  financialYear: string;
  /** One entry per holding, or per open lot when the holding has a transaction ledger. */
  holdings: Array<TaxHoldingInput & { accountName: string; accountId: string; instrumentId: string; lotLabel?: string }>;
  /** Lots sold during this financial year (from the ledger). */
  realized: Array<{ symbol: string; buyDate: string; sellDate: string; units: number; gain: number; term: 'short' | 'long' | null; bucket: Bucket | null }>;
  /** Net long-term equity gains already booked this year, which use up the exemption. */
  bookedLtcgEquity: number;
  /** Estimated tax (incl. cess) on gains already booked this year. */
  bookedTax: number;
  unpriced: Array<{ symbol: string; name: string }>;
  defaultSlabRate: number;
  slabSource: 'profile' | 'assumed';
  annualIncome: number | null;
}

/** Today's date in India as YYYY-MM-DD. */
export function todayInIndia(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const istDate = (d: Date) => todayInIndia(d);

/** Everything the Tax Centre needs for a user: verified-priced holdings with dates, and a slab rate. */
export async function getTaxCentreData(userId: string): Promise<TaxCentreData> {
  const [rows, ledger, profile] = await Promise.all([
    getUserHoldings(userId),
    getUserLedger(userId),
    db.select({ monthlyIncome: financialProfiles.monthlyIncome }).from(financialProfiles).where(eq(financialProfiles.userId, userId)).limit(1),
  ]);
  const asOf = todayInIndia();
  const annualIncome = profile[0]?.monthlyIncome != null ? Number(profile[0].monthlyIncome) * 12 : null;
  const fromProfile = marginalSlabRate(annualIncome);

  const fy = financialYear(asOf);
  const slab = fromProfile ?? 0.2;
  const holdingsOut: TaxCentreData['holdings'] = [];
  for (const h of rows) {
    if (h.currentPrice == null) continue;
    const category = taxCategoryFor(h.assetClass, h.sector, h.name);
    const txs = ledger.get(ledgerKey(h.accountId, h.instrumentId));
    if (txs && txs.length) {
      const lots = buildLots(txs).open;
      lots.forEach((l, i) =>
        holdingsOut.push({
          id: `${h.id}:${i}`,
          symbol: h.symbol,
          name: h.name,
          accountName: h.accountName,
          accountId: h.accountId,
          instrumentId: h.instrumentId,
          lotLabel: lots.length > 1 ? `lot ${i + 1} of ${lots.length}` : undefined,
          category,
          purchaseDate: l.buyDate,
          units: l.units,
          costPerUnit: l.costPerUnit,
          price: h.currentPrice as number,
        })
      );
    } else {
      holdingsOut.push({
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        accountName: h.accountName,
        accountId: h.accountId,
        instrumentId: h.instrumentId,
        category,
        purchaseDate: h.firstPurchasedAt ? istDate(new Date(h.firstPurchasedAt)) : null,
        units: h.units,
        costPerUnit: h.averageAcquisitionCost,
        price: h.currentPrice as number,
      });
    }
  }

  // Gains realised this financial year, each classified at its own sale date.
  const realizedPositions = [...ledger.values()].flatMap((txs) => {
    const t = txs[0];
    const category = taxCategoryFor(t.assetClass, t.sector, t.name);
    return buildLots(txs)
      .realized.filter((r) => financialYear(r.sellDate) === fy && r.units > 0)
      .map((r, i) => ({
        r,
        pos: classifyPosition(
          { id: `${t.symbol}-${r.sellId}-${i}`, symbol: t.symbol, name: t.name, category, purchaseDate: r.buyDate, units: r.units, costPerUnit: r.cost / r.units, price: r.proceeds / r.units },
          r.sellDate
        ),
      }));
  });
  const booked = computeTax(realizedPositions.map((x) => x.pos), { slabRate: slab });

  return {
    asOf,
    financialYear: fy,
    holdings: holdingsOut,
    realized: realizedPositions.map(({ r, pos }) => ({ symbol: pos.symbol, buyDate: r.buyDate, sellDate: r.sellDate, units: r.units, gain: r.gain, term: pos.term, bucket: pos.bucket })),
    bookedLtcgEquity: booked.exemptionUsed + booked.taxable.ltcgEquity,
    bookedTax: booked.totalTax,
    unpriced: rows.filter((h) => h.currentPrice == null).map((h) => ({ symbol: h.symbol, name: h.name })),
    defaultSlabRate: slab,
    slabSource: fromProfile != null ? 'profile' : 'assumed',
    annualIncome,
  };
}

/** Sets a holding's first purchase date, only if the holding belongs to the user. */
export async function setHoldingPurchaseDate(userId: string, holdingId: string, date: string): Promise<boolean> {
  const updated = await db
    .update(holdings)
    // Noon IST, so the stored instant falls on the same calendar day in India.
    .set({ firstPurchasedAt: new Date(`${date}T12:00:00+05:30`), updatedAt: new Date() })
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId)))
    .returning({ id: holdings.id });
  return updated.length > 0;
}
