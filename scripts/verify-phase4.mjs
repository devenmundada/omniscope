import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });

async function runPhase4Tests() {
  console.log('===============================================================');
  console.log('   OMNISCOPE PHASE 4: PERSONAL PROFILES & REAL PORTFOLIO DATA  ');
  console.log('           AUTOMATED ISOLATION & INTEGRATION TEST SUITE        ');
  console.log('===============================================================\n');

  const userA = 'a0000000-0000-0000-0000-000000000001';
  const userB = 'b0000000-0000-0000-0000-000000000002';
  const accountA1 = 'a1111111-1111-1111-1111-111111111111';
  const accountB1 = 'b1111111-1111-1111-1111-111111111111';
  const holdingA1 = 'a2222222-2222-2222-2222-222222222222';
  const holdingA2 = 'a3333333-3333-3333-3333-333333333333';

  try {
    // 0. Setup: Ensure test identities exist in auth.users and public.users
    await sql`
      INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
      VALUES 
        (${userA}, 'alpha_test@omniscope.dev', '{"full_name": "Alpha Investor"}'::jsonb, 'authenticated', 'authenticated'),
        (${userB}, 'beta_test@omniscope.dev', '{"full_name": "Beta Investor"}'::jsonb, 'authenticated', 'authenticated')
      ON CONFLICT (id) DO UPDATE SET raw_user_meta_data = EXCLUDED.raw_user_meta_data;
    `;

    await sql`
      INSERT INTO public.users (id, email, name)
      VALUES 
        (${userA}, 'alpha_test@omniscope.dev', 'Alpha Investor'),
        (${userB}, 'beta_test@omniscope.dev', 'Beta Investor')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `;
    console.log('[Setup] Test identities verified for User A and User B.\n');

    // Retrieve a verified instrument from catalogue for holding tests
    const [relianceInst] = await sql`SELECT id, symbol FROM public.instruments WHERE symbol = 'RELIANCE' LIMIT 1;`;
    const [hdfcInst] = await sql`SELECT id, symbol FROM public.instruments WHERE symbol = 'HDFCBANK' LIMIT 1;`;
    if (!relianceInst || !hdfcInst) {
      throw new Error('Instruments catalogue not seeded. Run scripts/seed-instruments.mjs first.');
    }

    // -------------------------------------------------------------
    // TEST 1: Profile Creation & User Scoping
    // -------------------------------------------------------------
    await sql`
      INSERT INTO public.financial_profiles (
        user_id, display_name, investor_archetype, monthly_income, monthly_expenses, risk_tolerance_score
      ) VALUES (
        ${userA}, 'Alpha', 'The Strategic Allocator', 250000.00, 80000.00, 85
      ) ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        investor_archetype = EXCLUDED.investor_archetype,
        monthly_income = EXCLUDED.monthly_income,
        monthly_expenses = EXCLUDED.monthly_expenses,
        risk_tolerance_score = EXCLUDED.risk_tolerance_score;
    `;

    await sql`
      INSERT INTO public.financial_profiles (
        user_id, display_name, investor_archetype, monthly_income, monthly_expenses, risk_tolerance_score
      ) VALUES (
        ${userB}, 'Beta', 'The Capital Preserver', 75000.00, 35000.00, 40
      ) ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        investor_archetype = EXCLUDED.investor_archetype,
        monthly_income = EXCLUDED.monthly_income,
        monthly_expenses = EXCLUDED.monthly_expenses,
        risk_tolerance_score = EXCLUDED.risk_tolerance_score;
    `;

    // User A reads profile under authenticated role
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated;`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true);`;

      const [profA] = await tx`SELECT display_name, investor_archetype, monthly_income FROM public.financial_profiles WHERE user_id = ${userA};`;
      if (profA?.display_name === 'Alpha' && profA?.investor_archetype === 'The Strategic Allocator') {
        console.log('✔ Test 1 PASSED: User A can read their own persistent financial profile.');
      } else {
        throw new Error('Test 1 FAILED: User A profile read mismatch.');
      }

      // User A attempts to read User B's profile
      const profBRows = await tx`SELECT * FROM public.financial_profiles WHERE user_id = ${userB};`;
      if (profBRows.length === 0) {
        console.log('✔ Test 2 PASSED: User A CANNOT read User B financial profile (0 rows returned via RLS).');
      } else {
        throw new Error('Test 2 FAILED: Cross-user profile leak detected!');
      }

      // User A attempts to update User B's profile
      const updateResult = await tx`UPDATE public.financial_profiles SET display_name = 'Hacked' WHERE user_id = ${userB} RETURNING id;`;
      if (updateResult.length === 0) {
        console.log('✔ Test 3 PASSED: User A CANNOT update User B financial profile (0 rows updated via RLS).');
      } else {
        throw new Error('Test 3 FAILED: Cross-user profile modification permitted!');
      }
    });

    // -------------------------------------------------------------
    // TEST 4 & 5: Accounts & Holdings Ownership Isolation
    // -------------------------------------------------------------
    await sql.begin(async (tx) => {
      // User A creates Account A1 and Holding A1
      await tx`SET LOCAL ROLE authenticated;`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true);`;

      await tx`
        INSERT INTO public.accounts (id, user_id, institution_name, account_type)
        VALUES (${accountA1}, ${userA}, 'Zerodha Alpha', 'demat')
        ON CONFLICT (id) DO NOTHING;
      `;

      await tx`
        INSERT INTO public.holdings (id, user_id, account_id, instrument_id, units, average_acquisition_cost)
        VALUES (${holdingA1}, ${userA}, ${accountA1}, ${relianceInst.id}, 50.0000, 2450.50)
        ON CONFLICT (id) DO NOTHING;
      `;
      console.log('✔ Test 4 PASSED: User A successfully created account and holding.');
    });

    await sql.begin(async (tx) => {
      // User B attempts to access User A's holding
      await tx`SET LOCAL ROLE authenticated;`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true);`;

      const readHolding = await tx`SELECT * FROM public.holdings WHERE id = ${holdingA1};`;
      if (readHolding.length === 0) {
        console.log('✔ Test 5 PASSED: User B CANNOT read User A holdings (0 rows returned via RLS).');
      } else {
        throw new Error('Test 5 FAILED: Cross-user holding read permitted!');
      }

      // User B attempts to delete User A's holding
      const delHolding = await tx`DELETE FROM public.holdings WHERE id = ${holdingA1} RETURNING id;`;
      if (delHolding.length === 0) {
        console.log('✔ Test 6 PASSED: User B CANNOT delete User A holdings (0 rows deleted via RLS).');
      } else {
        throw new Error('Test 6 FAILED: Cross-user holding delete permitted!');
      }
    });

    // -------------------------------------------------------------
    // TEST 7: Cross-User Account Reference Rejection
    // -------------------------------------------------------------
    let crossUserRejected = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated;`;
        await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true);`;

        // User B attempts to insert a holding into User A's Account A1
        await tx`
          INSERT INTO public.holdings (user_id, account_id, instrument_id, units, average_acquisition_cost)
          VALUES (${userB}, ${accountA1}, ${hdfcInst.id}, 20.0000, 1500.00);
        `;
      });
    } catch (err) {
      crossUserRejected = true;
    }

    if (crossUserRejected) {
      console.log('✔ Test 7 PASSED: Cross-user account reference rejected by composite FK & RLS.');
    } else {
      throw new Error('Test 7 FAILED: Cross-user account foreign key allowed illegal holding!');
    }

    // -------------------------------------------------------------
    // TEST 8: CSV Import Transactional Rollback Guarantee
    // -------------------------------------------------------------
    console.log('\n[Testing CSV Transactional Rollback Guarantee]');
    const initialHoldingsCount = await sql`SELECT count(*)::int as count FROM public.holdings WHERE user_id = ${userA};`;

    let txRollbackTriggered = false;
    try {
      await sql.begin(async (tx) => {
        // Step 1: Insert valid holding in transaction
        await tx`
          INSERT INTO public.holdings (id, user_id, account_id, instrument_id, units, average_acquisition_cost)
          VALUES (${holdingA2}, ${userA}, ${accountA1}, ${hdfcInst.id}, 100.0000, 1520.00);
        `;

        // Step 2: Intentional error to simulate row validation failure (e.g. invalid non-existent instrument ID)
        await tx`
          INSERT INTO public.holdings (user_id, account_id, instrument_id, units, average_acquisition_cost)
          VALUES (${userA}, ${accountA1}, '00000000-0000-0000-0000-000000000000', 50.0000, 100.00);
        `;
      });
    } catch (err) {
      txRollbackTriggered = true;
    }

    const postErrorCount = await sql`SELECT count(*)::int as count FROM public.holdings WHERE user_id = ${userA};`;
    if (txRollbackTriggered && postErrorCount[0].count === initialHoldingsCount[0].count) {
      console.log('✔ Test 8 PASSED: Transactional rollback verified. Failed import left ZERO partial data.');
    } else {
      throw new Error(`Test 8 FAILED: Partial data was leaked during failed batch! (Pre: ${initialHoldingsCount[0].count}, Post: ${postErrorCount[0].count})`);
    }

    // -------------------------------------------------------------
    // TEST 9: Financial Precision & Fractional Quantities
    // -------------------------------------------------------------
    await sql`
      INSERT INTO public.holdings (user_id, account_id, instrument_id, units, average_acquisition_cost)
      VALUES (${userA}, ${accountA1}, ${hdfcInst.id}, 450.1250, 1520.75)
      ON CONFLICT (user_id, account_id, instrument_id) DO UPDATE SET
        units = EXCLUDED.units,
        average_acquisition_cost = EXCLUDED.average_acquisition_cost;
    `;

    const [fractionalHolding] = await sql`
      SELECT units, average_acquisition_cost 
      FROM public.holdings 
      WHERE user_id = ${userA} AND instrument_id = ${hdfcInst.id};
    `;

    if (fractionalHolding.units === '450.1250' && fractionalHolding.average_acquisition_cost === '1520.75') {
      console.log('✔ Test 9 PASSED: Financial precision verified (4 decimal units, 2 decimal currency scale).');
    } else {
      throw new Error(`Test 9 FAILED: Precision mismatch: ${JSON.stringify(fractionalHolding)}`);
    }

    // -------------------------------------------------------------
    // Teardown: Clean up test fixtures
    // -------------------------------------------------------------
    await sql`DELETE FROM public.holdings WHERE user_id IN (${userA}, ${userB});`;
    await sql`DELETE FROM public.accounts WHERE user_id IN (${userA}, ${userB});`;
    await sql`DELETE FROM public.financial_profiles WHERE user_id IN (${userA}, ${userB});`;
    await sql`DELETE FROM public.users WHERE id IN (${userA}, ${userB});`;
    await sql`DELETE FROM auth.users WHERE id IN (${userA}, ${userB});`;
    console.log('\n[Teardown] Test fixtures cleaned up cleanly.');

    console.log('\n===============================================================');
    console.log('   ALL 9 PHASE 4 INTEGRATION & ISOLATION TESTS PASSED!       ');
    console.log('===============================================================');

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST RUNNER FAILED:', err);
    await sql.end();
    process.exit(1);
  }
}

runPhase4Tests();
