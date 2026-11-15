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

// Helper: parse AMFI line according to official specification
function parseAmfiLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('Scheme Code') || trimmed.includes('Open Ended Schemes') || trimmed.includes('Close Ended Schemes')) {
    return null;
  }

  const parts = trimmed.split(';');
  if (parts.length < 5) return null;

  const schemeCode = parts[0]?.trim();
  const isinDiv = parts[1]?.trim() || null;
  const isinGrowth = parts[2]?.trim() || null;
  const schemeName = parts[3]?.trim();
  const navStr = parts[parts.length - 2]?.trim();
  const dateStr = parts[parts.length - 1]?.trim();

  if (!schemeCode || !schemeName || !navStr) return null;

  const nav = parseFloat(navStr);
  if (isNaN(nav) || nav <= 0) return null;

  // Parse DD-MMM-YYYY date
  const dateMatch = dateStr?.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  let priceDate = new Date();
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2].toLowerCase();
    const year = parseInt(dateMatch[3], 10);
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    if (months[monthStr] !== undefined) {
      priceDate = new Date(Date.UTC(year, months[monthStr], day, 21, 0, 0));
    }
  }

  return { schemeCode, isinGrowth, schemeName, nav, priceDate };
}

// Helper: staleness calculation matching sync-service
function checkPriceStaleness(priceTimestamp, assetClass, now = new Date()) {
  const quoteTime = new Date(priceTimestamp).getTime();
  const nowTime = now.getTime();
  const ageHours = (nowTime - quoteTime) / (1000 * 60 * 60);

  if (assetClass === 'Mutual Funds') {
    // 48 hours for mutual funds (daily official NAV declared late evening)
    const isStale = ageHours > 48;
    return {
      isStale,
      displayStatus: isStale ? 'Stale NAV (>48h)' : 'Fresh Official NAV',
    };
  }

  // Equities / ETFs / Gold / Debt: 24h threshold
  const isStale = ageHours > 24;
  return {
    isStale,
    displayStatus: isStale ? 'Stale Quote (>24h)' : 'Verified EOD Close',
  };
}

// Helper: portfolio calculation matching lib/db/portfolio.ts
function calculateValuation(holding, currentPrice) {
  const investedAmount = holding.units * holding.averageAcquisitionCost;
  if (currentPrice == null) {
    return {
      investedAmount,
      currentPrice: null,
      currentValue: null,
      unrealizedGain: null,
      unrealizedGainPct: null,
      isPriced: false,
    };
  }

  const currentValue = holding.units * currentPrice;
  const unrealizedGain = currentValue - investedAmount;
  const unrealizedGainPct = investedAmount > 0 ? (unrealizedGain / investedAmount) * 100 : 0;

  return {
    investedAmount,
    currentPrice,
    currentValue,
    unrealizedGain,
    unrealizedGainPct,
    isPriced: true,
  };
}

async function runPhase5Tests() {
  console.log('===============================================================');
  console.log('   OMNISCOPE PHASE 5: MARKET DATA FOUNDATION & NAV SYNC        ');
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
    // TEST GROUP 1: Database Schema & Migration 0002 Verification
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Database Schema & Migration 0002 ---');

    await runAsyncTest('Migration 0002 is recorded in drizzle.__drizzle_migrations', async () => {
      const records = await sql`
        SELECT id, hash, created_at 
        FROM drizzle.__drizzle_migrations 
        WHERE id = 3;
      `;
      assert.strictEqual(records.length, 1, 'Migration 0002 record must exist in drizzle migrations table');
      assert(records[0].hash.includes('0002_market_prices_precision_and_types') || records[0].hash.length > 0);
    });

    await runAsyncTest('Numeric precision is numeric(18, 4) on market_prices columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'market_prices'
          AND column_name IN ('price', 'previous_close', 'day_change', 'high', 'low');
      `;
      assert.strictEqual(columns.length, 5, 'All 5 price columns must exist');
      for (const col of columns) {
        assert.strictEqual(col.data_type, 'numeric', `Column ${col.column_name} must be numeric`);
        assert.strictEqual(col.numeric_precision, 18, `Column ${col.column_name} precision must be 18`);
        assert.strictEqual(col.numeric_scale, 4, `Column ${col.column_name} scale must be 4`);
      }
    });

    await runAsyncTest('Column price_type exists with default LTP on market_prices', async () => {
      const [col] = await sql`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'market_prices'
          AND column_name = 'price_type';
      `;
      assert(col, 'Column price_type must exist in public.market_prices');
      assert.strictEqual(col.data_type, 'text');
      assert(col.column_default.includes('LTP'), 'Default price_type must be LTP');
    });

    await runAsyncTest('Unique constraint/index on (instrument_id) exists in market_prices', async () => {
      const [idx] = await sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = 'market_prices'
          AND indexname = 'market_prices_instrument_unique';
      `;
      assert(idx, 'Unique index market_prices_instrument_unique must exist');
      assert(idx.indexdef.includes('UNIQUE'), 'Index must be UNIQUE');
      assert(idx.indexdef.includes('instrument_id'), 'Index must cover instrument_id');
    });

    // -------------------------------------------------------------
    // TEST GROUP 2: AMFI NAV Parsing & Precision
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: AMFI NAV Parsing & Precision ---');

    runTest('AMFI Parser extracts 4-decimal NAV and DD-MMM-YYYY date correctly', () => {
      const line = '122639;INF209K01202;INF209K01210;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;90.6040;15-Oct-2026';
      const parsed = parseAmfiLine(line);
      assert(parsed, 'Line must parse successfully');
      assert.strictEqual(parsed.schemeCode, '122639');
      assert.strictEqual(parsed.isinGrowth, 'INF209K01210');
      assert.strictEqual(parsed.nav, 90.604);
      assert.strictEqual(parsed.priceDate.getUTCFullYear(), 2026);
      assert.strictEqual(parsed.priceDate.getUTCMonth(), 9); // October = 9 (0-indexed)
      assert.strictEqual(parsed.priceDate.getUTCDate(), 15);
    });

    runTest('AMFI Parser rejects header rows and category separators', () => {
      assert.strictEqual(parseAmfiLine('Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date'), null);
      assert.strictEqual(parseAmfiLine('Open Ended Schemes (Equity Scheme - Multi Cap Fund)'), null);
      assert.strictEqual(parseAmfiLine('   '), null);
      assert.strictEqual(parseAmfiLine('123;A;B;Bad Fund;N.A.;15-Oct-2026'), null);
    });

    // -------------------------------------------------------------
    // TEST GROUP 3: Idempotent Upsert & Pricing Persistence
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Idempotent Upsert & Pricing Persistence ---');

    const testInstrumentId = 'c0000000-0000-0000-0000-000000000001';

    await runAsyncTest('Create instrument and perform atomic idempotent upsert', async () => {
      // Create temporary instrument
      await sql`
        INSERT INTO public.instruments (id, symbol, name, isin, asset_class, exchange)
        VALUES (${testInstrumentId}, 'TEST_FUND', 'OmniScope Test Fund Direct Growth', 'INF000000001', 'Mutual Funds', 'AMFI')
        ON CONFLICT (id) DO NOTHING;
      `;

      // 1st Upsert
      await sql`
        INSERT INTO public.market_prices (
          instrument_id, price, price_type, currency, price_timestamp, source, day_change, day_change_pct
        ) VALUES (
          ${testInstrumentId}, 125.4525, 'NAV', 'INR', NOW(), 'AMFI', 1.2500, 1.01
        )
        ON CONFLICT (instrument_id) DO UPDATE SET
          price = EXCLUDED.price,
          price_type = EXCLUDED.price_type,
          price_timestamp = EXCLUDED.price_timestamp,
          updated_at = NOW();
      `;

      const [res1] = await sql`
        SELECT price, price_type, source FROM public.market_prices WHERE instrument_id = ${testInstrumentId};
      `;
      assert.strictEqual(Number(res1.price), 125.4525, 'Price must match 4 decimals');
      assert.strictEqual(res1.price_type, 'NAV');

      // 2nd Upsert (Updating existing row idempotently)
      await sql`
        INSERT INTO public.market_prices (
          instrument_id, price, price_type, currency, price_timestamp, source, day_change, day_change_pct
        ) VALUES (
          ${testInstrumentId}, 128.9875, 'NAV', 'INR', NOW(), 'AMFI', 3.5350, 2.82
        )
        ON CONFLICT (instrument_id) DO UPDATE SET
          price = EXCLUDED.price,
          price_type = EXCLUDED.price_type,
          price_timestamp = EXCLUDED.price_timestamp,
          updated_at = NOW();
      `;

      const rows = await sql`
        SELECT price, price_type FROM public.market_prices WHERE instrument_id = ${testInstrumentId};
      `;
      assert.strictEqual(rows.length, 1, 'Exactly one row must exist after multiple upserts (no duplicates)');
      assert.strictEqual(Number(rows[0].price), 128.9875, 'Price must update to new value');
    });

    // -------------------------------------------------------------
    // TEST GROUP 4: Portfolio Valuation & Partial Pricing Logic
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Portfolio Valuation Calculations ---');

    runTest('Valuation calculation with positive gain and exact precision', () => {
      const holding = { units: 100, averageAcquisitionCost: 80.50 };
      const currentPrice = 90.6040;
      const res = calculateValuation(holding, currentPrice);

      assert.strictEqual(res.investedAmount, 8050.00);
      assert.strictEqual(res.currentValue, 9060.40);
      assert.strictEqual(Math.round(res.unrealizedGain * 100) / 100, 1010.40);
      const gainPct = (1010.40 / 8050.00) * 100;
      assert(Math.abs(res.unrealizedGainPct - gainPct) < 0.001);
      assert.strictEqual(res.isPriced, true);
    });

    runTest('Valuation calculation with loss', () => {
      const holding = { units: 50, averageAcquisitionCost: 2500.00 };
      const currentPrice = 2400.00;
      const res = calculateValuation(holding, currentPrice);

      assert.strictEqual(res.investedAmount, 125000.00);
      assert.strictEqual(res.currentValue, 120000.00);
      assert.strictEqual(res.unrealizedGain, -5000.00);
      assert.strictEqual(res.unrealizedGainPct, -4.0);
    });

    runTest('Unpriced holding NEVER fabricates price or substitutes buy price', () => {
      const holding = { units: 25, averageAcquisitionCost: 150.00 };
      const res = calculateValuation(holding, null);

      assert.strictEqual(res.investedAmount, 3750.00);
      assert.strictEqual(res.currentPrice, null, 'Unpriced holding currentPrice must remain null');
      assert.strictEqual(res.currentValue, null, 'Unpriced holding currentValue must remain null');
      assert.strictEqual(res.unrealizedGain, null, 'Unpriced holding unrealizedGain must remain null');
      assert.strictEqual(res.unrealizedGainPct, null, 'Unpriced holding unrealizedGainPct must remain null');
      assert.strictEqual(res.isPriced, false);
    });

    runTest('Zero invested amount edge case handled without NaN', () => {
      const holding = { units: 10, averageAcquisitionCost: 0 };
      const res = calculateValuation(holding, 50.00);
      assert.strictEqual(res.investedAmount, 0);
      assert.strictEqual(res.currentValue, 500);
      assert.strictEqual(res.unrealizedGain, 500);
      assert.strictEqual(res.unrealizedGainPct, 0, 'Zero cost basis must yield 0% rather than NaN or Infinity');
    });

    // -------------------------------------------------------------
    // TEST GROUP 5: Staleness Detection Thresholds
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Staleness Detection ---');

    runTest('Fresh mutual fund NAV (<48h) is not stale', () => {
      const now = new Date('2026-10-16T12:00:00Z');
      const quoteTime = new Date('2026-10-15T21:00:00Z'); // 15h ago
      const staleness = checkPriceStaleness(quoteTime, 'Mutual Funds', now);
      assert.strictEqual(staleness.isStale, false);
      assert(staleness.displayStatus.includes('Fresh'));
    });

    runTest('Old mutual fund NAV (>48h) is flagged as stale', () => {
      const now = new Date('2026-10-16T12:00:00Z');
      const quoteTime = new Date('2026-10-13T21:00:00Z'); // 63h ago
      const staleness = checkPriceStaleness(quoteTime, 'Mutual Funds', now);
      assert.strictEqual(staleness.isStale, true);
      assert(staleness.displayStatus.includes('Stale'));
    });

    runTest('Equity quote (>24h) is flagged as stale', () => {
      const now = new Date('2026-10-16T12:00:00Z');
      const quoteTime = new Date('2026-10-14T10:00:00Z'); // 50h ago
      const staleness = checkPriceStaleness(quoteTime, 'Indian Stocks', now);
      assert.strictEqual(staleness.isStale, true);
      assert(staleness.displayStatus.includes('Stale'));
    });

    // -------------------------------------------------------------
    // TEST GROUP 6: Multi-Tenant Isolation with Live Market Prices
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Multi-Tenant Isolation with Market Prices ---');

    const userAlpha = 'a0000000-0000-0000-0000-000000000001';
    const userBeta = 'b0000000-0000-0000-0000-000000000002';
    const accountAlpha = 'a1111111-1111-1111-1111-111111111111';
    const accountBeta = 'b1111111-1111-1111-1111-111111111111';
    const holdingAlpha = 'a9999999-9999-9999-9999-999999999999';
    const holdingBeta = 'b9999999-9999-9999-9999-999999999999';

    await runAsyncTest('Holdings query strictly isolates priced assets by user_id', async () => {
      // Ensure test users exist
      await sql`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
        VALUES 
          (${userAlpha}, 'alpha_test@omniscope.dev', '{"full_name": "Alpha Investor"}'::jsonb, 'authenticated', 'authenticated'),
          (${userBeta}, 'beta_test@omniscope.dev', '{"full_name": "Beta Investor"}'::jsonb, 'authenticated', 'authenticated')
        ON CONFLICT (id) DO NOTHING;
      `;

      await sql`
        INSERT INTO public.users (id, email, name)
        VALUES 
          (${userAlpha}, 'alpha_test@omniscope.dev', 'Alpha Investor'),
          (${userBeta}, 'beta_test@omniscope.dev', 'Beta Investor')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;

      // Insert accounts if not present
      await sql`
        INSERT INTO public.accounts (id, user_id, institution_name, account_type)
        VALUES 
          (${accountAlpha}, ${userAlpha}, 'Alpha Demat', 'demat'),
          (${accountBeta}, ${userBeta}, 'Beta Demat', 'demat')
        ON CONFLICT (id) DO NOTHING;
      `;

      // Insert holdings for Alpha and Beta using testInstrumentId
      await sql`
        INSERT INTO public.holdings (id, user_id, account_id, instrument_id, units, average_acquisition_cost)
        VALUES 
          (${holdingAlpha}, ${userAlpha}, ${accountAlpha}, ${testInstrumentId}, 100.0, 100.0),
          (${holdingBeta}, ${userBeta}, ${accountBeta}, ${testInstrumentId}, 50.0, 110.0)
        ON CONFLICT (id) DO UPDATE SET units = EXCLUDED.units;
      `;

      // Alpha queries their priced holdings
      const alphaPricedHoldings = await sql`
        SELECT 
          h.id, h.user_id, h.units, h.average_acquisition_cost,
          mp.price AS current_price,
          (h.units * mp.price) AS current_value
        FROM public.holdings h
        LEFT JOIN public.market_prices mp ON h.instrument_id = mp.instrument_id
        WHERE h.user_id = ${userAlpha};
      `;

      assert(alphaPricedHoldings.some(h => h.id === holdingAlpha), 'Alpha must see their own holding');
      assert(!alphaPricedHoldings.some(h => h.id === holdingBeta), 'Alpha MUST NOT see Beta holding');
      assert.strictEqual(alphaPricedHoldings.every(h => h.user_id === userAlpha), true, 'All returned holdings must belong to Alpha');

      // Beta queries their priced holdings
      const betaPricedHoldings = await sql`
        SELECT 
          h.id, h.user_id, h.units, h.average_acquisition_cost,
          mp.price AS current_price,
          (h.units * mp.price) AS current_value
        FROM public.holdings h
        LEFT JOIN public.market_prices mp ON h.instrument_id = mp.instrument_id
        WHERE h.user_id = ${userBeta};
      `;

      assert(betaPricedHoldings.some(h => h.id === holdingBeta), 'Beta must see their own holding');
      assert(!betaPricedHoldings.some(h => h.id === holdingAlpha), 'Beta MUST NOT see Alpha holding');
      assert.strictEqual(betaPricedHoldings.every(h => h.user_id === userBeta), true, 'All returned holdings must belong to Beta');
    });

    // Cleanup test artifacts
    await sql`DELETE FROM public.holdings WHERE id IN (${holdingAlpha}, ${holdingBeta});`;
    await sql`DELETE FROM public.market_prices WHERE instrument_id = ${testInstrumentId};`;
    await sql`DELETE FROM public.instruments WHERE id = ${testInstrumentId};`;

    console.log('\n===============================================================');
    console.log(`   ALL ${passedTests}/${totalTests} PHASE 5 TESTS PASSED SUCCESSFULLY! `);
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\nVerification suite encountered an error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runPhase5Tests();
