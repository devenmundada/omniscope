import 'server-only';
import { loadFinancialSnapshot, type FinancialSnapshot } from '@/lib/ai/snapshot';
import { getTaxCentreData } from './tax';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from './index';
import { priceHistory } from './schema';
import { getHistory } from '@/lib/market-data/history';
import { buildAlerts, peakAndLast, type Alert, type CostCheck } from '@/lib/math/alerts';
import { classifyPosition } from '@/lib/math/tax';

export interface AlertsResult {
  asOf: string;
  alerts: Alert[];
}

/** Every alert for a user, from the same snapshot the Copilot reads plus tax lots and price history. */
export async function getAlerts(userId: string, preloaded?: FinancialSnapshot): Promise<AlertsResult> {
  const [snapshot, tax] = await Promise.all([preloaded ?? loadFinancialSnapshot(userId), getTaxCentreData(userId)]);
  const holdings = snapshot.summary.holdings;
  const asOf = tax.asOf;

  // Group priced holdings by instrument (the same fund can sit in two accounts).
  const byInstrument = new Map<string, { symbol: string; name: string; value: number }>();
  for (const h of holdings) {
    if (h.currentValue == null || h.currentValue <= 0) continue;
    const g = byInstrument.get(h.instrumentId);
    if (g) g.value += h.currentValue;
    else byInstrument.set(h.instrumentId, { symbol: h.symbol, name: h.name, value: h.currentValue });
  }
  const total = [...byInstrument.values()].reduce((s, g) => s + g.value, 0);
  const marketTraded = holdings.filter((h) => h.assetClass !== 'Fixed Income' && h.currentValue != null).map((h) => h.instrumentId);
  const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const history = await getHistory([...new Set(marketTraded)], since).catch(() => new Map());

  const alertHoldings = [...byInstrument.entries()].map(([id, g]) => {
    const series = history.get(id) ?? [];
    const { last, peak, peakDate } = series.length >= 60 ? peakAndLast(series) : { last: null, peak: null, peakDate: null };
    return { ...g, weight: total > 0 ? g.value / total : 0, last, peak1y: peak, peakDate };
  });

  const latest = holdings.reduce<Date | null>((m, h) => (h.priceTimestamp && (!m || h.priceTimestamp > m) ? h.priceTimestamp : m), null);
  const goals = snapshot.summary.goalsSummary.projections.map((p) => ({
    name: p.goal.name,
    probability: snapshot.goalSimulations.find((g) => g.goalId === p.goal.id)?.simulation?.nominal.probabilityOfSuccess ?? null,
    deadline: p.details.deadlineDate,
  }));

  // Stocks and ETFs: the adjusted close on the purchase date, to catch unrecorded bonuses and splits.
  const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const checkable = holdings.filter((h) => (h.assetClass === 'Indian Stocks' || h.assetClass === 'ETFs') && h.firstPurchasedAt && h.currentPrice != null);
  const costChecks = (
    await Promise.all(
      checkable.map(async (h): Promise<CostCheck | null> => {
        const day = istDay(new Date(h.firstPurchasedAt as Date));
        const weekBefore = new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
        const [row] = await db
          .select({ date: priceHistory.priceDate, close: priceHistory.close })
          .from(priceHistory)
          .where(and(eq(priceHistory.instrumentId, h.instrumentId), lte(priceHistory.priceDate, day), gte(priceHistory.priceDate, weekBefore)))
          .orderBy(desc(priceHistory.priceDate))
          .limit(1);
        if (!row) return null;
        return { symbol: h.symbol, units: h.units, averageCost: h.averageAcquisitionCost, purchaseDate: day, adjustedClose: Number(row.close), price: h.currentPrice as number };
      })
    ).catch((): Array<CostCheck | null> => [])
  ).filter((c): c is CostCheck => c != null);

  const alerts = buildAlerts({
    costChecks,
    asOf,
    taxPositions: tax.holdings.map((h) => classifyPosition(h, asOf)),
    tax: { slabRate: tax.defaultSlabRate, ltcgAlreadyBooked: tax.bookedLtcgEquity },
    bookedTax: tax.bookedTax,
    holdings: alertHoldings,
    unpricedCount: tax.unpriced.length,
    latestPriceDate: latest ? new Date(latest.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : null,
    goals,
    emergencyFundMonths: snapshot.summary.emergencyFund.fundedMonths,
    emergencyTargetMonths: snapshot.summary.emergencyFund.targetMonths,
  });
  return { asOf, alerts };
}
