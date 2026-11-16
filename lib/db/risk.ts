import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from './index';
import { instruments } from './schema';
import { getUserHoldings, type UserHoldingView } from './portfolio';
import { defaultStatsFor } from './performance';
import { getHistory, BENCHMARK_SYMBOL, type HistoryPoint } from '@/lib/market-data/history';
import {
  alignedReturns,
  blendedExpectedReturns,
  cagr,
  column,
  computeRiskMetrics,
  correlationFromCov,
  factorBetas,
  ledoitWolf,
  portfolioReturns,
  riskContributions,
  sampleCovariance,
  variance,
  RISK_FREE_RATE,
  TRADING_DAYS,
  type Matrix,
  type PortfolioRiskMetrics,
  type PricePoint,
} from '@/lib/math/risk';

/** Gold ETF whose returns stand in for gold (and for Sovereign Gold Bonds, which track gold). */
export const GOLD_FACTOR_SYMBOL = 'GOLDBEES';
const LOOKBACK_DAYS = 760;
const MIN_OBSERVATIONS = 120;

export interface RiskAsset {
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  value: number;
  weight: number;
  /** Symbol whose price history was used instead of the asset's own, if any. */
  proxy: string | null;
  annualReturn: number;
  annualVolatility: number;
  betaEquity: number;
  betaGold: number;
  r2: number;
  expectedReturn: number;
  riskShare: number;
}

export interface RiskReport {
  asOf: string;
  portfolioValue: number;
  analysedValue: number;
  assets: RiskAsset[];
  excluded: Array<{ symbol: string; name: string; value: number; reason: string }>;
  metrics: PortfolioRiskMetrics;
  benchmark: { symbol: string; annualReturn: number; annualVolatility: number; maxDrawdown: number; sharpe: number };
  correlation: Matrix;
  /** Annualised inputs for the optimiser (asset order matches `assets`). */
  optimizer: { mu: number[]; cov: Matrix; riskFree: number; shrinkage: number; historyWeight: number };
  riskFree: number;
}

function groupHoldings(holdings: UserHoldingView[]) {
  const map = new Map<string, { instrumentId: string; symbol: string; name: string; assetClass: string; value: number }>();
  for (const h of holdings) {
    if (h.currentValue == null || h.currentValue <= 0) continue;
    const g = map.get(h.instrumentId);
    if (g) g.value += h.currentValue;
    else map.set(h.instrumentId, { instrumentId: h.instrumentId, symbol: h.symbol, name: h.name, assetClass: h.assetClass, value: h.currentValue });
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Synthetic accrual series for deposits: steady growth at `rate`, zero volatility. */
function accrualSeries(calendar: string[], rate: number): PricePoint[] {
  return calendar.map((date, t) => ({ date, close: (1 + rate) ** (t / TRADING_DAYS) }));
}

function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export interface PortfolioReturns {
  grouped: ReturnType<typeof groupHoldings>;
  included: Array<ReturnType<typeof groupHoldings>[number] & { series: HistoryPoint[]; proxy: string | null }>;
  excluded: RiskReport['excluded'];
  dates: string[];
  /** Daily returns, one column per included holding. */
  returns: Matrix;
  nifty: number[];
  gold: number[];
}

/**
 * Loads a user's verified-priced holdings and aligns their daily returns (with the Nifty 50 and gold
 * factors) over the last `lookbackDays` calendar days. Gold bonds use Gold BeES as a price proxy and
 * deposits a steady accrual; holdings with too little history are reported as excluded.
 */
export async function loadPortfolioReturns(
  userId: string,
  lookbackDays = LOOKBACK_DAYS,
  preloaded?: UserHoldingView[]
): Promise<PortfolioReturns | null> {
  const holdings = preloaded ?? (await getUserHoldings(userId));
  const grouped = groupHoldings(holdings);
  if (grouped.length === 0) return null;

  const factorRows = await db
    .select({ id: instruments.id, symbol: instruments.symbol })
    .from(instruments)
    .where(inArray(instruments.symbol, [BENCHMARK_SYMBOL, GOLD_FACTOR_SYMBOL]));
  const niftyId = factorRows.find((r) => r.symbol === BENCHMARK_SYMBOL)?.id;
  const goldId = factorRows.find((r) => r.symbol === GOLD_FACTOR_SYMBOL)?.id;
  if (!niftyId || !goldId) return null;

  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const history = await getHistory([...new Set([...grouped.map((g) => g.instrumentId), niftyId, goldId])], since);
  const calendar = (history.get(niftyId) ?? []).map((p) => p.date);
  if (calendar.length < MIN_OBSERVATIONS) return null;

  const excluded: RiskReport['excluded'] = [];
  const included: PortfolioReturns['included'] = [];
  for (const g of grouped) {
    if (g.assetClass === 'Fixed Income') {
      included.push({ ...g, series: accrualSeries(calendar, defaultStatsFor('Fixed Income').r), proxy: 'accrual' });
    } else if (g.assetClass === 'Gold') {
      included.push({ ...g, series: history.get(goldId) ?? [], proxy: GOLD_FACTOR_SYMBOL });
    } else {
      const own = history.get(g.instrumentId) ?? [];
      if (own.length >= MIN_OBSERVATIONS) included.push({ ...g, series: own, proxy: null });
      else excluded.push({ symbol: g.symbol, name: g.name, value: g.value, reason: `Only ${own.length} days of price history` });
    }
  }
  if (included.length === 0) return null;

  const { dates, returns: all } = alignedReturns(calendar, [...included.map((a) => a.series), history.get(niftyId)!, history.get(goldId)!]);
  if (dates.length < MIN_OBSERVATIONS) return null;
  const n = included.length;
  return {
    grouped,
    included,
    excluded,
    dates,
    returns: all.map((row) => row.slice(0, n)),
    nifty: column(all, n),
    gold: column(all, n + 1),
  };
}

/** Long-run return prior by what a holding actually tracks, not its label: a gold ETF is gold. */
export function returnPriors(data: PortfolioReturns): { priors: number[]; betas: Array<{ equity: number; gold: number; r2: number }> } {
  const betas = data.included.map((a, j) =>
    a.proxy === 'accrual' ? { equity: 0, gold: 0, r2: 0 } : factorBetas(column(data.returns, j), data.nifty, data.gold)
  );
  const priors = data.included.map((a, j) =>
    betas[j].gold > 0.7 && Math.abs(betas[j].equity) < 0.3 ? defaultStatsFor('Gold').r : defaultStatsFor(a.assetClass).r
  );
  return { priors, betas };
}

/**
 * Expected annual return and volatility of the user's current mix from the risk model (shrunk
 * expected returns, Ledoit-Wolf covariance of the actual holdings). Goal simulations use this so
 * every page projects goals with the same model as the Risk Lab and the goal optimiser.
 */
export async function portfolioRiskModel(
  userId: string,
  holdings?: UserHoldingView[]
): Promise<{ annualReturn: number; annualVolatility: number } | null> {
  const data = await loadPortfolioReturns(userId, LOOKBACK_DAYS, holdings);
  if (!data) return null;
  const total = data.included.reduce((s, a) => s + a.value, 0);
  const w = data.included.map((a) => a.value / total);
  const { mu } = blendedExpectedReturns(data.returns, returnPriors(data).priors);
  const cov = ledoitWolf(data.returns).cov;
  const annualReturn = w.reduce((s, x, i) => s + x * mu[i], 0);
  const variance = w.reduce((s, x, i) => s + x * cov[i].reduce((t, c, j) => t + c * w[j], 0), 0) * TRADING_DAYS;
  return { annualReturn, annualVolatility: Math.sqrt(Math.max(variance, 0)) };
}

/** Builds the full risk analysis for a user's verified-priced holdings, or null if there is nothing to analyse. */
export async function getRiskReport(userId: string): Promise<RiskReport | null> {
  const data = await loadPortfolioReturns(userId);
  if (!data) return null;
  const { grouped, included, excluded, dates, returns, nifty } = data;

  const analysedValue = included.reduce((s, a) => s + a.value, 0);
  const weights = included.map((a) => a.value / analysedValue);
  const daily = portfolioReturns(returns, weights);
  const metrics = computeRiskMetrics(dates, daily, nifty);
  const benchMetrics = computeRiskMetrics(dates, nifty, null);

  const sample = sampleCovariance(returns);
  const shares = riskContributions(sample, weights);
  const lw = ledoitWolf(returns);
  const { priors, betas } = returnPriors(data);
  const { mu, historyWeight } = blendedExpectedReturns(returns, priors);

  const assets: RiskAsset[] = included.map((a, j) => {
    const col = column(returns, j);
    return {
      instrumentId: a.instrumentId,
      symbol: a.symbol,
      name: a.name,
      assetClass: a.assetClass,
      value: a.value,
      weight: weights[j],
      proxy: a.proxy,
      annualReturn: cagr(col),
      annualVolatility: Math.sqrt(variance(col) * TRADING_DAYS),
      betaEquity: betas[j].equity,
      betaGold: betas[j].gold,
      r2: betas[j].r2,
      expectedReturn: mu[j],
      riskShare: shares[j],
    };
  });

  return {
    asOf: dates[dates.length - 1],
    portfolioValue: grouped.reduce((s, g) => s + g.value, 0),
    analysedValue,
    assets,
    excluded,
    metrics: { ...metrics, underwater: thin(metrics.underwater, 260) },
    benchmark: {
      symbol: BENCHMARK_SYMBOL,
      annualReturn: benchMetrics.annualReturn,
      annualVolatility: benchMetrics.annualVolatility,
      maxDrawdown: benchMetrics.maxDrawdown,
      sharpe: benchMetrics.sharpe,
    },
    correlation: correlationFromCov(sample),
    optimizer: {
      mu,
      cov: lw.cov.map((row) => row.map((v) => v * TRADING_DAYS)),
      riskFree: RISK_FREE_RATE,
      shrinkage: lw.shrinkage,
      historyWeight,
    },
    riskFree: RISK_FREE_RATE,
  };
}
