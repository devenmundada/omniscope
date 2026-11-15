import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import assert from 'assert';

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });

// Pure mathematical engine import for direct testing
import { calculateXRayAnalytics, isHoldingVerifiedPriced } from '../lib/db/xray.ts';

async function runPhase6Tests() {
  console.log('===============================================================');
  console.log('   OMNISCOPE PHASE 6: PORTFOLIO X-RAY & DEEP ANALYTICS         ');
  console.log('           AUTOMATED VERIFICATION & TEST SUITE                 ');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function runTest(testName, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ [FAIL] Test ${totalTests}: ${testName}`);
      console.error(`     Error: ${err.message}\n`);
      throw err;
    }
  }

  async function runAsyncTest(testName, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ [FAIL] Test ${totalTests}: ${testName}`);
      console.error(`     Error: ${err.message}\n`);
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: Asset-Class Allocation & Precision Math
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Asset-Class Allocation & Precision Math ---');

    runTest('Allocation percentages sum to 100% across multiple asset classes', () => {
      const mockHoldings = [
        {
          id: '1',
          userId: 'u1',
          accountId: 'a1',
          accountName: 'Zerodha',
          accountType: 'demat',
          instrumentId: 'i1',
          symbol: 'RELIANCE',
          name: 'Reliance Industries',
          isin: 'INE002A01018',
          assetClass: 'Indian Stocks',
          sector: 'Energy',
          exchange: 'NSE',
          units: 50.5,
          averageAcquisitionCost: 2000.0,
          investedAmount: 101000.0,
          currentPrice: 3000.0,
          currentValue: 151500.0,
          unrealizedGain: 50500.0,
          unrealizedGainPct: 50.0,
          priceTimestamp: new Date(),
          priceSource: 'TWELVE_DATA',
          priceType: 'EOD',
          dayChangePct: 1.2,
          isPriceStale: false,
          priceStatusLabel: 'Twelve Data EOD Close',
          marketCapCategory: 'Large Cap',
          metadata: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          userId: 'u1',
          accountId: 'a2',
          accountName: 'Groww',
          accountType: 'mutual_fund',
          instrumentId: 'i2',
          symbol: 'PPFAS-FC',
          name: 'Parag Parikh Flexi Cap',
          isin: 'INF879O01018',
          assetClass: 'Mutual Funds',
          sector: 'Flexi Cap',
          exchange: 'AMFI',
          units: 1000.25,
          averageAcquisitionCost: 50.0,
          investedAmount: 50012.5,
          currentPrice: 80.0,
          currentValue: 80020.0,
          unrealizedGain: 30007.5,
          unrealizedGainPct: 60.0,
          priceTimestamp: new Date(),
          priceSource: 'AMFI',
          priceType: 'NAV',
          dayChangePct: 0.5,
          isPriceStale: false,
          priceStatusLabel: 'Official AMFI NAV',
          marketCapCategory: 'Multi Cap',
          metadata: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          userId: 'u1',
          accountId: 'a1',
          accountName: 'Zerodha',
          accountType: 'demat',
          instrumentId: 'i3',
          symbol: 'SGB23',
          name: 'Sovereign Gold Bond',
          isin: 'IN0020230085',
          assetClass: 'Gold',
          sector: 'Commodity',
          exchange: 'NSE',
          units: 10.0,
          averageAcquisitionCost: 6000.0,
          investedAmount: 60000.0,
          currentPrice: 7500.0,
          currentValue: 75000.0,
          unrealizedGain: 15000.0,
          unrealizedGainPct: 25.0,
          priceTimestamp: new Date(),
          priceSource: 'IBJA_GOLD_BENCHMARK',
          priceType: 'REDEMPTION',
          dayChangePct: 0.2,
          isPriceStale: false,
          priceStatusLabel: 'IBJA Gold Benchmark',
          marketCapCategory: null,
          metadata: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const res = calculateXRayAnalytics(mockHoldings, 'u1');
      assert.strictEqual(res.hasHoldings, true);
      assert.strictEqual(res.assetClassAllocations.length, 3);

      const totalMarketValue = 151500.0 + 80020.0 + 75000.0;
      assert.strictEqual(res.dataQuality.verifiedMarketValueTotal, totalMarketValue);

      const weightSum = res.assetClassAllocations.reduce((sum, ac) => sum + ac.verifiedWeightPct, 0);
      assert(Math.abs(weightSum - 100.0) < 0.001, 'Market value weights must sum to 100%');

      const costSum = res.assetClassAllocations.reduce((sum, ac) => sum + ac.costWeightPct, 0);
      assert(Math.abs(costSum - 100.0) < 0.001, 'Cost weights must sum to 100%');
    });

    runTest('Zero denominator handling in empty portfolio or zero-value positions', () => {
      const emptyRes = calculateXRayAnalytics([], 'empty-user');
      assert.strictEqual(emptyRes.hasHoldings, false);
      assert.strictEqual(emptyRes.concentration.hhi, 0);
      assert.strictEqual(emptyRes.concentration.hhiClassification, 'Insufficient Data');
      assert.strictEqual(emptyRes.dataQuality.verifiedMarketValueTotal, 0);
      assert.strictEqual(emptyRes.dataQuality.valuationCoveragePct, 0);
    });

    // -------------------------------------------------------------
    // TEST GROUP 2: Missing, Stale & Unverified Price Handling
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Price Freshness & Unverified Fixture Exclusion ---');

    runTest('Unverified static fixtures are EXCLUDED from verified market-value analytics', () => {
      const unverifiedHolding = {
        id: 'mock-1',
        userId: 'u1',
        accountId: 'a1',
        accountName: 'Zerodha',
        accountType: 'demat',
        instrumentId: 'i-mock',
        symbol: 'MOCK_STOCK',
        name: 'Mock Test Stock',
        isin: 'INE000000000',
        assetClass: 'Indian Stocks',
        sector: 'Technology',
        exchange: 'NSE',
        units: 100,
        averageAcquisitionCost: 50.0,
        investedAmount: 5000.0,
        currentPrice: 100.0,
        currentValue: 10000.0,
        unrealizedGain: 5000.0,
        unrealizedGainPct: 100.0,
        priceTimestamp: new Date(),
        priceSource: 'STATIC_REFERENCE_FIXTURE', // Offline fixture
        priceType: 'UNVERIFIED_REFERENCE',
        dayChangePct: 0,
        isPriceStale: true,
        priceStatusLabel: 'Awaiting Verified Exchange Feed (Static Reference)',
        marketCapCategory: 'Mid Cap',
        metadata: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      assert.strictEqual(isHoldingVerifiedPriced(unverifiedHolding), false);

      const res = calculateXRayAnalytics([unverifiedHolding], 'u1');
      assert.strictEqual(res.dataQuality.pricedHoldingsCount, 0, 'Unverified fixture must not be counted as priced');
      assert.strictEqual(res.dataQuality.unpricedHoldingsCount, 1, 'Must be marked as unpriced awaiting feed');
      assert.strictEqual(res.dataQuality.verifiedMarketValueTotal, 0, 'Must not contribute to verified market value');
      assert.strictEqual(res.dataQuality.unpricedCostBasisTotal, 5000.0, 'Must preserve cost basis');
    });

    runTest('Unpriced holding never counted as zero market value or substituted with cost', () => {
      const unpricedHolding = {
        id: 'u-1',
        userId: 'u1',
        accountId: 'a1',
        accountName: 'Zerodha',
        accountType: 'demat',
        instrumentId: 'i-unpriced',
        symbol: 'UNPRICED',
        name: 'Unpriced Bond',
        isin: null,
        assetClass: 'Fixed Income',
        sector: 'Debt',
        exchange: 'OTHER',
        units: 10,
        averageAcquisitionCost: 1000.0,
        investedAmount: 10000.0,
        currentPrice: null, // No price observation
        currentValue: null,
        unrealizedGain: null,
        unrealizedGainPct: null,
        priceTimestamp: null,
        priceSource: null,
        priceType: null,
        dayChangePct: null,
        isPriceStale: false,
        priceStatusLabel: 'Awaiting Market Feed',
        marketCapCategory: null,
        metadata: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = calculateXRayAnalytics([unpricedHolding], 'u1');
      assert.strictEqual(res.dataQuality.unpricedHoldingsCount, 1);
      assert.strictEqual(res.concentration.topHoldings[0].verifiedValue, null, 'Must remain null, never 0');
      assert.strictEqual(res.concentration.topHoldings[0].verifiedWeightPct, null, 'Weight must be null');
      assert.strictEqual(res.concentration.topHoldings[0].costBasis, 10000.0);
    });

    // -------------------------------------------------------------
    // TEST GROUP 3: Unknown / Unclassified Sectors & Market Caps
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Unknown Sectors & Market Caps ---');

    runTest('Holdings with null or generic sectors are explicitly categorized as Unknown/Unclassified', () => {
      const holdingWithNullSector = {
        id: 's-1',
        userId: 'u1',
        accountId: 'a1',
        accountName: 'Folio',
        accountType: 'mutual_fund',
        instrumentId: 'i-s1',
        symbol: 'MISC-FUND',
        name: 'Miscellaneous Fund',
        isin: null,
        assetClass: 'Mutual Funds',
        sector: null, // Unclassified sector
        exchange: 'AMFI',
        units: 100,
        averageAcquisitionCost: 10.0,
        investedAmount: 1000.0,
        currentPrice: 15.0,
        currentValue: 1500.0,
        unrealizedGain: 500.0,
        unrealizedGainPct: 50.0,
        priceTimestamp: new Date(),
        priceSource: 'AMFI',
        priceType: 'NAV',
        dayChangePct: 0.1,
        isPriceStale: false,
        priceStatusLabel: 'Official AMFI NAV',
        marketCapCategory: null,
        metadata: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = calculateXRayAnalytics([holdingWithNullSector], 'u1');
      const unclassified = res.sectorExposures.find((s) => s.isUnclassified);
      assert(unclassified, 'Unknown / Unclassified sector bucket must exist');
      assert.strictEqual(unclassified.sector, 'Unknown / Unclassified');
      assert.strictEqual(unclassified.verifiedValue, 1500.0);
      assert.strictEqual(unclassified.verifiedWeightPct, 100.0);

      const unclassifiedMc = res.marketCapExposures.find((mc) => mc.category === 'Unclassified');
      assert(unclassifiedMc, 'Unclassified market cap bucket must exist');
      assert.strictEqual(unclassifiedMc.verifiedValue, 1500.0);
    });

    // -------------------------------------------------------------
    // TEST GROUP 4: Concentration Metrics & HHI Scoring
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Concentration Metrics & HHI ---');

    runTest('HHI calculation reflects exact formula: sum of squared percentage weights', () => {
      // 4 positions: 40%, 30%, 20%, 10%
      // HHI = 40^2 + 30^2 + 20^2 + 10^2 = 1600 + 900 + 400 + 100 = 3000 (Highly Concentrated)
      const holdings = [
        { id: '1', units: 4, averageAcquisitionCost: 100, investedAmount: 400, currentPrice: 100, currentValue: 4000, priceSource: 'AMFI', priceType: 'NAV' },
        { id: '2', units: 3, averageAcquisitionCost: 100, investedAmount: 300, currentPrice: 100, currentValue: 3000, priceSource: 'AMFI', priceType: 'NAV' },
        { id: '3', units: 2, averageAcquisitionCost: 100, investedAmount: 200, currentPrice: 100, currentValue: 2000, priceSource: 'AMFI', priceType: 'NAV' },
        { id: '4', units: 1, averageAcquisitionCost: 100, investedAmount: 100, currentPrice: 100, currentValue: 1000, priceSource: 'AMFI', priceType: 'NAV' },
      ].map((h, i) => ({
        ...h,
        userId: 'u1',
        accountId: 'a1',
        accountName: 'Account',
        accountType: 'demat',
        instrumentId: `inst-${i}`,
        symbol: `SYM${i}`,
        name: `Stock ${i}`,
        isin: null,
        assetClass: 'Indian Stocks',
        sector: 'Financials',
        exchange: 'NSE',
        unrealizedGain: 0,
        unrealizedGainPct: 0,
        priceTimestamp: new Date(),
        dayChangePct: 0,
        isPriceStale: false,
        priceStatusLabel: 'Official AMFI NAV',
        marketCapCategory: 'Large Cap',
        metadata: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = calculateXRayAnalytics(holdings, 'u1');
      assert.strictEqual(res.concentration.hhi, 3000);
      assert.strictEqual(res.concentration.hhiClassification, 'Highly Concentrated');
      assert.strictEqual(res.concentration.top1WeightPct, 40.0);
      assert.strictEqual(res.concentration.top3WeightPct, 90.0);
      assert.strictEqual(res.concentration.top5WeightPct, 100.0);
    });

    runTest('Well-diversified portfolio (10 equal holdings of 10% each) yields HHI = 1000', () => {
      const holdings = Array.from({ length: 10 }, (_, i) => ({
        id: `h-${i}`,
        userId: 'u1',
        accountId: 'a1',
        accountName: 'Account',
        accountType: 'demat',
        instrumentId: `inst-${i}`,
        symbol: `SYM${i}`,
        name: `Stock ${i}`,
        isin: null,
        assetClass: 'Indian Stocks',
        sector: `Sector ${i}`,
        exchange: 'NSE',
        units: 10,
        averageAcquisitionCost: 100,
        investedAmount: 1000,
        currentPrice: 100,
        currentValue: 1000,
        unrealizedGain: 0,
        unrealizedGainPct: 0,
        priceTimestamp: new Date(),
        priceSource: 'AMFI',
        priceType: 'NAV',
        dayChangePct: 0,
        isPriceStale: false,
        priceStatusLabel: 'Official AMFI NAV',
        marketCapCategory: 'Large Cap',
        metadata: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = calculateXRayAnalytics(holdings, 'u1');
      assert.strictEqual(res.concentration.hhi, 1000);
      assert.strictEqual(res.concentration.hhiClassification, 'Well Diversified');
    });

    // -------------------------------------------------------------
    // TEST GROUP 5: Look-Through Transparency & Zero Fabrication
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Look-Through Transparency ---');

    runTest('Unverified look-through constituents are NOT fabricated or simulated', () => {
      const res = calculateXRayAnalytics(
        [
          {
            id: '1',
            userId: 'u1',
            accountId: 'a1',
            accountName: 'Demat',
            accountType: 'demat',
            instrumentId: 'i1',
            symbol: 'PPFAS-FC',
            name: 'Parag Parikh Flexi Cap Fund',
            isin: 'INF879O01018',
            assetClass: 'Mutual Funds',
            sector: 'Flexi Cap',
            exchange: 'AMFI',
            units: 100,
            averageAcquisitionCost: 50,
            investedAmount: 5000,
            currentPrice: 80,
            currentValue: 8000,
            unrealizedGain: 3000,
            unrealizedGainPct: 60,
            priceTimestamp: new Date(),
            priceSource: 'AMFI',
            priceType: 'NAV',
            dayChangePct: 0.5,
            isPriceStale: false,
            priceStatusLabel: 'Official AMFI NAV',
            marketCapCategory: 'Multi Cap',
            metadata: {}, // Empty metadata (no verified AMC constituent disclosures)
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        'u1'
      );

      assert.strictEqual(res.lookThrough.isAvailable, false);
      assert.strictEqual(res.lookThrough.items.length, 0, 'Must NOT fabricate constituent companies');
      assert.strictEqual(res.lookThrough.overlaps.length, 0, 'Must NOT fabricate fund overlaps');
      assert(res.lookThrough.explanation.includes('pending verified'), 'Must give honest explanation');
    });

    // -------------------------------------------------------------
    // TEST GROUP 6: Live Database Multi-Tenant Isolation
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Live Database Multi-Tenant Isolation ---');

    const userAlpha = 'a0000000-0000-0000-0000-000000000061';
    const userBeta = 'b0000000-0000-0000-0000-000000000062';
    const accountAlpha = 'a1111111-1111-1111-1111-111111111161';
    const accountBeta = 'b1111111-1111-1111-1111-111111111162';
    const holdingAlpha = 'a9999999-9999-9999-9999-999999999961';
    const holdingBeta = 'b9999999-9999-9999-9999-999999999962';

    const instAlphaId = 'c0000000-0000-0000-0000-000000000061';
    const instBetaId = 'c0000000-0000-0000-0000-000000000062';

    await runAsyncTest('X-Ray queries strictly isolate user holdings with zero cross-tenant leak', async () => {
      // 1. Setup test users
      await sql`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
        VALUES 
          (${userAlpha}, 'alpha_xray@omniscope.dev', '{"full_name": "Alpha Investor"}'::jsonb, 'authenticated', 'authenticated'),
          (${userBeta}, 'beta_xray@omniscope.dev', '{"full_name": "Beta Investor"}'::jsonb, 'authenticated', 'authenticated')
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO public.users (id, email, name)
        VALUES 
          (${userAlpha}, 'alpha_xray@omniscope.dev', 'Alpha Investor'),
          (${userBeta}, 'beta_xray@omniscope.dev', 'Beta Investor')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;

      // 2. Setup accounts
      await sql`
        INSERT INTO public.accounts (id, user_id, institution_name, account_type)
        VALUES 
          (${accountAlpha}, ${userAlpha}, 'Alpha Demat', 'demat'),
          (${accountBeta}, ${userBeta}, 'Beta Folio', 'mutual_fund')
        ON CONFLICT (id) DO NOTHING;
      `;

      // 3. Setup distinct instruments & prices
      await sql`
        INSERT INTO public.instruments (id, symbol, name, isin, asset_class, sector, exchange, market_cap_category)
        VALUES 
          (${instAlphaId}, 'ALPHA_TECH', 'Alpha Tech Solutions', 'INF000000061', 'Indian Stocks', 'Information Technology', 'NSE', 'Large Cap'),
          (${instBetaId}, 'BETA_GOLD', 'Beta Gold Trust', 'INF000000062', 'Gold', 'Commodity', 'NSE', null)
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO public.market_prices (instrument_id, price, price_type, currency, price_timestamp, source)
        VALUES 
          (${instAlphaId}, 1500.0000, 'EOD', 'INR', NOW(), 'TWELVE_DATA'),
          (${instBetaId}, 7200.0000, 'REDEMPTION', 'INR', NOW(), 'IBJA_GOLD_BENCHMARK')
        ON CONFLICT (instrument_id) DO UPDATE SET price = EXCLUDED.price;
      `;

      // 4. Setup distinct holdings
      await sql`
        INSERT INTO public.holdings (id, user_id, account_id, instrument_id, units, average_acquisition_cost)
        VALUES 
          (${holdingAlpha}, ${userAlpha}, ${accountAlpha}, ${instAlphaId}, 100.0, 1000.0),
          (${holdingBeta}, ${userBeta}, ${accountBeta}, ${instBetaId}, 10.0, 6500.0)
        ON CONFLICT (id) DO UPDATE SET units = EXCLUDED.units;
      `;

      // 5. Dynamic query matching getUserHoldings
      const fetchHoldings = async (uid) => {
        const rows = await sql`
          SELECT 
            h.id, h.user_id as "userId", h.account_id as "accountId", a.institution_name as "accountName", a.account_type as "accountType",
            i.id as "instrumentId", i.symbol, i.name, i.isin, i.asset_class as "assetClass", i.sector, i.exchange,
            i.market_cap_category as "marketCapCategory", i.metadata,
            h.units::float, h.average_acquisition_cost::float as "averageAcquisitionCost",
            (h.units * h.average_acquisition_cost)::float as "investedAmount",
            mp.price::float as "currentPrice",
            (h.units * mp.price)::float as "currentValue",
            mp.price_timestamp as "priceTimestamp", mp.source as "priceSource", mp.price_type as "priceType",
            false as "isPriceStale", 'Verified' as "priceStatusLabel",
            h.notes, h.created_at as "createdAt", h.updated_at as "updatedAt"
          FROM public.holdings h
          JOIN public.accounts a ON h.account_id = a.id
          JOIN public.instruments i ON h.instrument_id = i.id
          LEFT JOIN public.market_prices mp ON h.instrument_id = mp.instrument_id
          WHERE h.user_id = ${uid};
        `;
        return rows;
      };

      const alphaHoldings = await fetchHoldings(userAlpha);
      const betaHoldings = await fetchHoldings(userBeta);

      assert.strictEqual(alphaHoldings.length, 1);
      assert.strictEqual(alphaHoldings[0].symbol, 'ALPHA_TECH');
      assert.strictEqual(betaHoldings.length, 1);
      assert.strictEqual(betaHoldings[0].symbol, 'BETA_GOLD');

      const alphaAnalytics = calculateXRayAnalytics(alphaHoldings, userAlpha);
      const betaAnalytics = calculateXRayAnalytics(betaHoldings, userBeta);

      // Verify Alpha analytics contain ZERO Beta data
      assert.strictEqual(alphaAnalytics.assetClassAllocations[0].assetClass, 'Indian Stocks');
      assert(!alphaAnalytics.assetClassAllocations.some(ac => ac.assetClass === 'Gold'), 'Alpha must have 0 Gold exposure');
      assert.strictEqual(alphaAnalytics.sectorExposures[0].sector, 'Information Technology');

      // Verify Beta analytics contain ZERO Alpha data
      assert.strictEqual(betaAnalytics.assetClassAllocations[0].assetClass, 'Gold');
      assert(!betaAnalytics.assetClassAllocations.some(ac => ac.assetClass === 'Indian Stocks'), 'Beta must have 0 Stocks exposure');
      assert.strictEqual(betaAnalytics.sectorExposures[0].sector, 'Commodity');

      // Verify no mock data from lib/data.ts is present
      assert(!alphaAnalytics.concentration.topHoldings.some(h => h.symbol === 'motilalnasdaq'));
      assert(!betaAnalytics.concentration.topHoldings.some(h => h.symbol === 'motilalnasdaq'));
    });

    // Cleanup test artifacts
    await sql`DELETE FROM public.holdings WHERE id IN (${holdingAlpha}, ${holdingBeta});`;
    await sql`DELETE FROM public.market_prices WHERE instrument_id IN (${instAlphaId}, ${instBetaId});`;
    await sql`DELETE FROM public.instruments WHERE id IN (${instAlphaId}, ${instBetaId});`;
    await sql`DELETE FROM public.accounts WHERE id IN (${accountAlpha}, ${accountBeta});`;
    await sql`DELETE FROM public.users WHERE id IN (${userAlpha}, ${userBeta});`;
    await sql`DELETE FROM auth.users WHERE id IN (${userAlpha}, ${userBeta});`;

    console.log('\n===============================================================');
    console.log(`   ALL ${passedTests}/${totalTests} PHASE 6 TESTS PASSED SUCCESSFULLY! `);
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\nVerification suite encountered an error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runPhase6Tests();
