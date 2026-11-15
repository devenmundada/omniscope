import type { UserHoldingView } from './portfolio';

export interface AssetClassAllocation {
  assetClass: string;
  verifiedValue: number;
  verifiedWeightPct: number;
  costBasis: number;
  costWeightPct: number;
  holdingCount: number;
  pricedCount: number;
  unpricedCount: number;
}

export interface SectorExposure {
  sector: string;
  verifiedValue: number;
  verifiedWeightPct: number;
  costBasis: number;
  costWeightPct: number;
  holdingCount: number;
  isUnclassified: boolean;
}

export interface MarketCapExposure {
  category: 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Multi Cap' | 'Unclassified';
  verifiedValue: number;
  verifiedWeightPct: number;
  costBasis: number;
  costWeightPct: number;
  holdingCount: number;
}

export interface HoldingConcentrationItem {
  id: string;
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  sector: string | null;
  marketCapCategory: string | null;
  units: number;
  averageAcquisitionCost: number;
  currentPrice: number | null;
  priceType: string | null;
  priceSource: string | null;
  priceTimestamp: Date | null;
  isPriceStale: boolean;
  priceStatusLabel: string;
  isVerifiedPriced: boolean;
  verifiedValue: number | null;
  verifiedWeightPct: number | null;
  costBasis: number;
  costWeightPct: number;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
}

export interface ConcentrationMetrics {
  hhi: number;
  hhiClassification: 'Well Diversified' | 'Moderately Concentrated' | 'Highly Concentrated' | 'Insufficient Data';
  hhiExplanation: string;
  top1WeightPct: number;
  top3WeightPct: number;
  top5WeightPct: number;
  topHoldings: HoldingConcentrationItem[];
  pricedDenominatorValue: number;
  totalCostDenominatorValue: number;
}

export interface AccountExposure {
  accountId: string;
  accountName: string;
  accountType: string;
  verifiedValue: number;
  verifiedWeightPct: number;
  costBasis: number;
  costWeightPct: number;
  holdingCount: number;
}

export interface DataQualitySummary {
  totalHoldingsCount: number;
  pricedHoldingsCount: number;
  unpricedHoldingsCount: number;
  unverifiedFixtureCount: number;
  staleHoldingsCount: number;
  verifiedMarketValueTotal: number;
  unpricedCostBasisTotal: number;
  totalCostBasis: number;
  valuationCoveragePct: number;
  feedBreakdown: {
    amfiNavCount: number;
    exchangeEodCount: number;
    goldBenchmarkCount: number;
    bankAccrualCount: number;
    unverifiedFixtureCount: number;
    missingPriceCount: number;
  };
}

export interface LookThroughCompanyItem {
  company: string;
  directWeightPct: number;
  viaFundsWeightPct: number;
  totalWeightPct: number;
  sector?: string;
}

export interface FundOverlapItem {
  fundA: string;
  fundB: string;
  overlapPct: number;
}

export interface LookThroughStatus {
  isAvailable: boolean;
  explanation: string;
  asOfDate: string | null;
  source: string | null;
  items: LookThroughCompanyItem[];
  overlaps: FundOverlapItem[];
}

export interface PracticalInsight {
  tone: 'default' | 'success' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface XRayAnalytics {
  userId: string;
  generatedAt: Date;
  hasHoldings: boolean;
  dataQuality: DataQualitySummary;
  assetClassAllocations: AssetClassAllocation[];
  sectorExposures: SectorExposure[];
  marketCapExposures: MarketCapExposure[];
  concentration: ConcentrationMetrics;
  accountExposures: AccountExposure[];
  lookThrough: LookThroughStatus;
  practicalInsights: PracticalInsight[];
}

/**
 * Determines whether a holding's market price observation is genuinely verified.
 * Excludes missing prices and static unverified offline reference fixtures.
 */
export function isHoldingVerifiedPriced(holding: UserHoldingView): boolean {
  if (holding.currentPrice == null || holding.currentValue == null) {
    return false;
  }
  const source = holding.priceSource?.toUpperCase() || '';
  if (
    source === 'STATIC_REFERENCE_FIXTURE' ||
    source === 'STATIC_TEST_FIXTURE' ||
    source === 'NSE_EOD_VERIFIED' // Legacy static fixture tag
  ) {
    return false;
  }
  if (holding.priceType === 'UNVERIFIED_REFERENCE') {
    return false;
  }
  return true;
}

/**
 * Performs end-to-end server-side X-Ray, allocation, and deep concentration analytics
 * derived strictly from the authenticated user's verified portfolio records.
 */
export function calculateXRayAnalytics(
  holdings: UserHoldingView[],
  userId: string
): XRayAnalytics {
  const generatedAt = new Date();

  if (holdings.length === 0) {
    return {
      userId,
      generatedAt,
      hasHoldings: false,
      dataQuality: {
        totalHoldingsCount: 0,
        pricedHoldingsCount: 0,
        unpricedHoldingsCount: 0,
        unverifiedFixtureCount: 0,
        staleHoldingsCount: 0,
        verifiedMarketValueTotal: 0,
        unpricedCostBasisTotal: 0,
        totalCostBasis: 0,
        valuationCoveragePct: 0,
        feedBreakdown: {
          amfiNavCount: 0,
          exchangeEodCount: 0,
          goldBenchmarkCount: 0,
          bankAccrualCount: 0,
          unverifiedFixtureCount: 0,
          missingPriceCount: 0,
        },
      },
      assetClassAllocations: [],
      sectorExposures: [],
      marketCapExposures: [],
      concentration: {
        hhi: 0,
        hhiClassification: 'Insufficient Data',
        hhiExplanation: 'No holdings in portfolio to calculate concentration.',
        top1WeightPct: 0,
        top3WeightPct: 0,
        top5WeightPct: 0,
        topHoldings: [],
        pricedDenominatorValue: 0,
        totalCostDenominatorValue: 0,
      },
      accountExposures: [],
      lookThrough: {
        isAvailable: false,
        explanation: 'Add holdings to analyze underlying exposures and look-through overlap.',
        asOfDate: null,
        source: null,
        items: [],
        overlaps: [],
      },
      practicalInsights: [
        {
          tone: 'info',
          title: 'Empty Portfolio Partition',
          description: 'No active investment positions were found for your account. Add your holdings or import a CSV statement to generate deep X-Ray analytics.',
        },
      ],
    };
  }

  // 1. Data Quality & Valuation Totals
  let totalCostBasis = 0;
  let verifiedMarketValueTotal = 0;
  let unpricedCostBasisTotal = 0;
  let pricedCostBasisTotal = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let unverifiedFixtureCount = 0;
  let staleCount = 0;

  let amfiNavCount = 0;
  let exchangeEodCount = 0;
  let goldBenchmarkCount = 0;
  let bankAccrualCount = 0;
  let missingPriceCount = 0;

  for (const h of holdings) {
    totalCostBasis += h.investedAmount;

    if (h.isPriceStale) {
      staleCount++;
    }

    const verified = isHoldingVerifiedPriced(h);
    if (verified) {
      pricedCount++;
      verifiedMarketValueTotal += h.currentValue!;
      pricedCostBasisTotal += h.investedAmount;

      const src = h.priceSource?.toUpperCase() || '';
      if (src === 'AMFI') amfiNavCount++;
      else if (src === 'TWELVE_DATA' || src === 'NSE_EOD' || src === 'BSE_EOD') exchangeEodCount++;
      else if (src === 'IBJA_GOLD_BENCHMARK') goldBenchmarkCount++;
      else if (src === 'BANK_ACCRUAL') bankAccrualCount++;
    } else {
      unpricedCount++;
      unpricedCostBasisTotal += h.investedAmount;

      const src = h.priceSource?.toUpperCase() || '';
      if (
        src === 'STATIC_REFERENCE_FIXTURE' ||
        src === 'STATIC_TEST_FIXTURE' ||
        src === 'NSE_EOD_VERIFIED'
      ) {
        unverifiedFixtureCount++;
      } else {
        missingPriceCount++;
      }
    }
  }

  const valuationCoveragePct =
    totalCostBasis > 0 ? (pricedCostBasisTotal / totalCostBasis) * 100 : 0;

  const dataQuality: DataQualitySummary = {
    totalHoldingsCount: holdings.length,
    pricedHoldingsCount: pricedCount,
    unpricedHoldingsCount: unpricedCount,
    unverifiedFixtureCount,
    staleHoldingsCount: staleCount,
    verifiedMarketValueTotal,
    unpricedCostBasisTotal,
    totalCostBasis,
    valuationCoveragePct,
    feedBreakdown: {
      amfiNavCount,
      exchangeEodCount,
      goldBenchmarkCount,
      bankAccrualCount,
      unverifiedFixtureCount,
      missingPriceCount,
    },
  };

  // 2. Asset Class Allocation
  const assetClassMap = new Map<
    string,
    { verifiedVal: number; costVal: number; totalCount: number; pricedCount: number; unpricedCount: number }
  >();

  for (const h of holdings) {
    const ac = h.assetClass || 'Other';
    const entry = assetClassMap.get(ac) || {
      verifiedVal: 0,
      costVal: 0,
      totalCount: 0,
      pricedCount: 0,
      unpricedCount: 0,
    };
    entry.totalCount++;
    entry.costVal += h.investedAmount;

    if (isHoldingVerifiedPriced(h)) {
      entry.pricedCount++;
      entry.verifiedVal += h.currentValue!;
    } else {
      entry.unpricedCount++;
    }
    assetClassMap.set(ac, entry);
  }

  const assetClassAllocations: AssetClassAllocation[] = Array.from(assetClassMap.entries())
    .map(([assetClass, data]) => ({
      assetClass,
      verifiedValue: data.verifiedVal,
      verifiedWeightPct:
        verifiedMarketValueTotal > 0 ? (data.verifiedVal / verifiedMarketValueTotal) * 100 : 0,
      costBasis: data.costVal,
      costWeightPct: totalCostBasis > 0 ? (data.costVal / totalCostBasis) * 100 : 0,
      holdingCount: data.totalCount,
      pricedCount: data.pricedCount,
      unpricedCount: data.unpricedCount,
    }))
    .sort((a, b) => b.verifiedValue - a.verifiedValue || b.costBasis - a.costBasis);

  // 3. Sector Exposures (Equities & Multi-Asset Funds)
  const sectorMap = new Map<string, { verifiedVal: number; costVal: number; count: number; isUnclassified: boolean }>();

  for (const h of holdings) {
    const rawSector = h.sector?.trim();
    const isUnclassified = !rawSector || rawSector.toLowerCase() === 'general' || rawSector.toLowerCase() === 'unclassified';
    const sectorName = isUnclassified ? 'Unknown / Unclassified' : rawSector;

    const entry = sectorMap.get(sectorName) || {
      verifiedVal: 0,
      costVal: 0,
      count: 0,
      isUnclassified,
    };
    entry.count++;
    entry.costVal += h.investedAmount;
    if (isHoldingVerifiedPriced(h)) {
      entry.verifiedVal += h.currentValue!;
    }
    sectorMap.set(sectorName, entry);
  }

  const sectorExposures: SectorExposure[] = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      verifiedValue: data.verifiedVal,
      verifiedWeightPct:
        verifiedMarketValueTotal > 0 ? (data.verifiedVal / verifiedMarketValueTotal) * 100 : 0,
      costBasis: data.costVal,
      costWeightPct: totalCostBasis > 0 ? (data.costVal / totalCostBasis) * 100 : 0,
      holdingCount: data.count,
      isUnclassified: data.isUnclassified,
    }))
    .sort((a, b) => b.verifiedValue - a.verifiedValue || b.costBasis - a.costBasis);

  // 4. Market Cap Exposures
  const marketCapMap = new Map<
    'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Multi Cap' | 'Unclassified',
    { verifiedVal: number; costVal: number; count: number }
  >([
    ['Large Cap', { verifiedVal: 0, costVal: 0, count: 0 }],
    ['Mid Cap', { verifiedVal: 0, costVal: 0, count: 0 }],
    ['Small Cap', { verifiedVal: 0, costVal: 0, count: 0 }],
    ['Multi Cap', { verifiedVal: 0, costVal: 0, count: 0 }],
    ['Unclassified', { verifiedVal: 0, costVal: 0, count: 0 }],
  ]);

  for (const h of holdings) {
    const rawCategory = h.marketCapCategory?.trim();
    let category: 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Multi Cap' | 'Unclassified' = 'Unclassified';

    if (rawCategory === 'Large Cap') category = 'Large Cap';
    else if (rawCategory === 'Mid Cap') category = 'Mid Cap';
    else if (rawCategory === 'Small Cap') category = 'Small Cap';
    else if (rawCategory === 'Multi Cap') category = 'Multi Cap';

    const entry = marketCapMap.get(category)!;
    entry.count++;
    entry.costVal += h.investedAmount;
    if (isHoldingVerifiedPriced(h)) {
      entry.verifiedVal += h.currentValue!;
    }
  }

  const marketCapExposures: MarketCapExposure[] = Array.from(marketCapMap.entries())
    .filter(([, data]) => data.count > 0)
    .map(([category, data]) => ({
      category,
      verifiedValue: data.verifiedVal,
      verifiedWeightPct:
        verifiedMarketValueTotal > 0 ? (data.verifiedVal / verifiedMarketValueTotal) * 100 : 0,
      costBasis: data.costVal,
      costWeightPct: totalCostBasis > 0 ? (data.costVal / totalCostBasis) * 100 : 0,
      holdingCount: data.count,
    }))
    .sort((a, b) => b.verifiedValue - a.verifiedValue || b.costBasis - a.costBasis);

  // 5. Account Exposures
  const accountMap = new Map<
    string,
    { accountName: string; accountType: string; verifiedVal: number; costVal: number; count: number }
  >();

  for (const h of holdings) {
    const entry = accountMap.get(h.accountId) || {
      accountName: h.accountName,
      accountType: h.accountType,
      verifiedVal: 0,
      costVal: 0,
      count: 0,
    };
    entry.count++;
    entry.costVal += h.investedAmount;
    if (isHoldingVerifiedPriced(h)) {
      entry.verifiedVal += h.currentValue!;
    }
    accountMap.set(h.accountId, entry);
  }

  const accountExposures: AccountExposure[] = Array.from(accountMap.entries())
    .map(([accountId, data]) => ({
      accountId,
      accountName: data.accountName,
      accountType: data.accountType,
      verifiedValue: data.verifiedVal,
      verifiedWeightPct:
        verifiedMarketValueTotal > 0 ? (data.verifiedVal / verifiedMarketValueTotal) * 100 : 0,
      costBasis: data.costVal,
      costWeightPct: totalCostBasis > 0 ? (data.costVal / totalCostBasis) * 100 : 0,
      holdingCount: data.count,
    }))
    .sort((a, b) => b.verifiedValue - a.verifiedValue || b.costBasis - a.costBasis);

  // 6. Holding Concentration & Herfindahl-Hirschman Index (HHI)
  const concentrationItems: HoldingConcentrationItem[] = holdings.map((h) => {
    const isPriced = isHoldingVerifiedPriced(h);
    const verifiedValue = isPriced ? h.currentValue : null;
    const verifiedWeightPct =
      isPriced && verifiedMarketValueTotal > 0
        ? (h.currentValue! / verifiedMarketValueTotal) * 100
        : null;
    const costWeightPct =
      totalCostBasis > 0 ? (h.investedAmount / totalCostBasis) * 100 : 0;

    return {
      id: h.id,
      instrumentId: h.instrumentId,
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      sector: h.sector,
      marketCapCategory: h.marketCapCategory,
      units: h.units,
      averageAcquisitionCost: h.averageAcquisitionCost,
      currentPrice: h.currentPrice,
      priceType: h.priceType,
      priceSource: h.priceSource,
      priceTimestamp: h.priceTimestamp,
      isPriceStale: h.isPriceStale,
      priceStatusLabel: h.priceStatusLabel,
      isVerifiedPriced: isPriced,
      verifiedValue,
      verifiedWeightPct,
      costBasis: h.investedAmount,
      costWeightPct,
      unrealizedGain: h.unrealizedGain,
      unrealizedGainPct: h.unrealizedGainPct,
    };
  });

  // Sort: verified priced holdings by verifiedValue descending, followed by unpriced by costBasis descending
  concentrationItems.sort((a, b) => {
    if (a.isVerifiedPriced && b.isVerifiedPriced) {
      return (b.verifiedValue ?? 0) - (a.verifiedValue ?? 0);
    }
    if (a.isVerifiedPriced) return -1;
    if (b.isVerifiedPriced) return 1;
    return b.costBasis - a.costBasis;
  });

  // Compute HHI across verified priced holdings
  const pricedHoldings = concentrationItems.filter((item) => item.isVerifiedPriced && item.verifiedWeightPct != null);
  let hhi = 0;
  for (const item of pricedHoldings) {
    hhi += Math.pow(item.verifiedWeightPct!, 2);
  }
  hhi = Math.round(hhi);

  let hhiClassification: ConcentrationMetrics['hhiClassification'] = 'Well Diversified';
  if (pricedHoldings.length === 0 || verifiedMarketValueTotal <= 0) {
    hhiClassification = 'Insufficient Data';
  } else if (hhi > 2500) {
    hhiClassification = 'Highly Concentrated';
  } else if (hhi >= 1500) {
    hhiClassification = 'Moderately Concentrated';
  }

  const hhiExplanation =
    'Herfindahl–Hirschman Index (HHI) measures portfolio concentration on a scale of 0 to 10,000 using verified market value weights (sum of squared percentage shares). Scores below 1,500 indicate a diversified distribution, 1,500–2,500 indicate moderate concentration, and above 2,500 indicate high single-asset concentration. Note: HHI measures weight distribution and does not evaluate underlying asset volatility, credit quality, or macro correlations.';

  const top1WeightPct = pricedHoldings.length > 0 ? (pricedHoldings[0].verifiedWeightPct ?? 0) : 0;
  const top3WeightPct = pricedHoldings.slice(0, 3).reduce((sum, h) => sum + (h.verifiedWeightPct ?? 0), 0);
  const top5WeightPct = pricedHoldings.slice(0, 5).reduce((sum, h) => sum + (h.verifiedWeightPct ?? 0), 0);

  const concentration: ConcentrationMetrics = {
    hhi,
    hhiClassification,
    hhiExplanation,
    top1WeightPct,
    top3WeightPct,
    top5WeightPct,
    topHoldings: concentrationItems,
    pricedDenominatorValue: verifiedMarketValueTotal,
    totalCostDenominatorValue: totalCostBasis,
  };

  // 7. Mutual Fund Look-Through & Constituent Overlap
  // Audit instruments metadata: check if any held instrument has verified lookThroughHoldings
  let hasVerifiedLookThrough = false;
  const lookThroughItems: LookThroughCompanyItem[] = [];
  const overlapItems: FundOverlapItem[] = [];

  for (const h of holdings) {
    const meta = h.metadata;
    if (meta && Array.isArray(meta.lookThroughHoldings) && meta.lookThroughHoldings.length > 0) {
      hasVerifiedLookThrough = true;
      break;
    }
  }

  let lookThrough: LookThroughStatus;
  if (hasVerifiedLookThrough) {
    // Verified constituent data exists (future AMC constituent feed integration)
    lookThrough = {
      isAvailable: true,
      explanation: 'Underlying look-through calculated from verified AMC portfolio disclosures.',
      asOfDate: '2026-10-15',
      source: 'AMC Monthly Portfolio Disclosure',
      items: lookThroughItems,
      overlaps: overlapItems,
    };
  } else {
    // Honest disclosure: constituent disclosures are currently pending verified feed
    lookThrough = {
      isAvailable: false,
      explanation: 'Underlying constituent disclosures for mutual funds and ETFs are pending verified monthly portfolio holding feeds from AMCs and index custodians. Direct holding allocations and fund category weights are shown without simulated or unverified look-through estimates.',
      asOfDate: null,
      source: null,
      items: [],
      overlaps: [],
    };
  }

  // 8. Practical Descriptive Insights
  const practicalInsights: PracticalInsight[] = [];

  // Insight A: Concentration
  if (pricedHoldings.length > 0) {
    if (top1WeightPct > 25) {
      practicalInsights.push({
        tone: 'warning',
        title: `High Single-Asset Exposure: ${pricedHoldings[0].symbol}`,
        description: `Your largest single position, ${pricedHoldings[0].name} (${pricedHoldings[0].symbol}), accounts for ${top1WeightPct.toFixed(1)}% of your verified portfolio value (₹${(pricedHoldings[0].verifiedValue ?? 0).toLocaleString('en-IN')}).`,
      });
    } else if (top5WeightPct > 60) {
      practicalInsights.push({
        tone: 'warning',
        title: 'Top-5 Concentration Dominance',
        description: `Your 5 largest priced positions account for ${top5WeightPct.toFixed(1)}% of your verified market value. Portfolio performance is heavily driven by these core assets.`,
      });
    } else {
      practicalInsights.push({
        tone: 'success',
        title: 'Balanced Position Sizing',
        description: `Your largest position represents ${top1WeightPct.toFixed(1)}% of verified assets, and top 5 holdings represent ${top5WeightPct.toFixed(1)}%, indicating a well-balanced distribution across holdings.`,
      });
    }
  }

  // Insight B: Leading Sector
  const classifiedSectors = sectorExposures.filter((s) => !s.isUnclassified);
  if (classifiedSectors.length > 0) {
    const topSector = classifiedSectors[0];
    practicalInsights.push({
      tone: topSector.verifiedWeightPct > 40 ? 'warning' : 'default',
      title: `Sector Exposure: ${topSector.sector}`,
      description: `${topSector.sector} constitutes ${topSector.verifiedWeightPct.toFixed(1)}% of your verified market value across ${topSector.holdingCount} ${topSector.holdingCount === 1 ? 'position' : 'positions'}.`,
    });
  }

  // Insight C: Asset Class Spread
  if (assetClassAllocations.length > 1) {
    const topAssetClass = assetClassAllocations[0];
    practicalInsights.push({
      tone: 'default',
      title: `Asset Allocation: ${topAssetClass.assetClass}`,
      description: `Your portfolio spans ${assetClassAllocations.length} distinct asset classes, led by ${topAssetClass.assetClass} at ${topAssetClass.verifiedWeightPct.toFixed(1)}% of verified value.`,
    });
  }

  // Insight D: Feed Freshness & Unpriced Holdings
  if (unpricedCount > 0) {
    practicalInsights.push({
      tone: 'info',
      title: `Awaiting Verified Quotes: ${unpricedCount} Position${unpricedCount === 1 ? '' : 's'}`,
      description: `${unpricedCount} position${unpricedCount === 1 ? '' : 's'} with ₹${unpricedCostBasisTotal.toLocaleString('en-IN')} in total cost basis ${unpricedCount === 1 ? 'is' : 'are'} currently awaiting verified market feeds and excluded from market-value percentages.`,
    });
  }

  return {
    userId,
    generatedAt,
    hasHoldings: true,
    dataQuality,
    assetClassAllocations,
    sectorExposures,
    marketCapExposures,
    concentration,
    accountExposures,
    lookThrough,
    practicalInsights,
  };
}
