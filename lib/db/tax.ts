import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from './index';
import { financialProfiles, holdings } from './schema';
import { getUserHoldings } from './portfolio';
import { financialYear, marginalSlabRate, taxCategoryFor, type TaxHoldingInput } from '@/lib/math/tax';

export interface TaxCentreData {
  asOf: string;
  financialYear: string;
  holdings: Array<TaxHoldingInput & { accountName: string }>;
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
  const [rows, profile] = await Promise.all([
    getUserHoldings(userId),
    db.select({ monthlyIncome: financialProfiles.monthlyIncome }).from(financialProfiles).where(eq(financialProfiles.userId, userId)).limit(1),
  ]);
  const asOf = todayInIndia();
  const annualIncome = profile[0]?.monthlyIncome != null ? Number(profile[0].monthlyIncome) * 12 : null;
  const fromProfile = marginalSlabRate(annualIncome);

  return {
    asOf,
    financialYear: financialYear(asOf),
    holdings: rows
      .filter((h) => h.currentPrice != null)
      .map((h) => ({
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        accountName: h.accountName,
        category: taxCategoryFor(h.assetClass, h.sector, h.name),
        purchaseDate: h.firstPurchasedAt ? istDate(new Date(h.firstPurchasedAt)) : null,
        units: h.units,
        costPerUnit: h.averageAcquisitionCost,
        price: h.currentPrice as number,
      })),
    unpriced: rows.filter((h) => h.currentPrice == null).map((h) => ({ symbol: h.symbol, name: h.name })),
    defaultSlabRate: fromProfile ?? 0.2,
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
