import 'server-only';
import { getRiskReport } from './risk';
import { getTaxCentreData } from './tax';
import type { RebalanceData } from '@/lib/math/rebalance-plan';

export type { RebalanceData };

/** Everything the rebalancer needs: the risk model's assets and covariance, and every open tax lot. */
export async function getRebalanceData(userId: string): Promise<RebalanceData | null> {
  const [report, tax] = await Promise.all([getRiskReport(userId), getTaxCentreData(userId)]);
  if (!report || report.assets.length < 2) return null;
  const assets = report.assets.map((a) => {
    const lots = tax.holdings.filter((h) => h.instrumentId === a.instrumentId);
    const price = lots[0]?.price ?? 0;
    return {
      symbol: a.symbol,
      name: a.name,
      assetClass: a.assetClass,
      weight: a.weight,
      category: lots[0]?.category ?? 'equity',
      price,
      value: a.value,
      lots: lots.map((l) => ({ id: l.id, account: l.accountName, purchaseDate: l.purchaseDate, units: l.units, costPerUnit: l.costPerUnit })),
    };
  });
  return {
    asOf: tax.asOf,
    financialYear: tax.financialYear,
    assets,
    optimizer: { mu: report.optimizer.mu, cov: report.optimizer.cov, riskFree: report.optimizer.riskFree },
    slabRate: tax.defaultSlabRate,
    slabSource: tax.slabSource,
    booked: tax.realized.map((r) => ({ bucket: r.bucket, term: r.term, gain: r.gain })),
    bookedLtcgEquity: tax.bookedLtcgEquity,
    excluded: report.excluded,
  };
}
