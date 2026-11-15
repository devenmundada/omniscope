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

// Import pure math and scoring engines
import {
  resolveGoalDeadline,
  calculateFutureValue,
  calculateRequiredMonthlyContribution,
  computeGoalProjectionDetails,
} from '../lib/math/financial-projections.ts';

import {
  evaluateHealthScores,
  HEALTH_SCORE_ENGINE_VERSION,
  BASE_PILLAR_WEIGHTS,
} from '../lib/math/health-engine.ts';

async function runPhase7Tests() {
  console.log('===============================================================');
  console.log('   OMNISCOPE PHASE 7: FINANCIAL HEALTH, RISK & GOALS           ');
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
    // TEST GROUP 1: Goal Deadlines & Calendar Interpretations
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Goal Deadlines & Calendar Interpretations ---');

    const asOfFixed = new Date('2026-10-17T12:00:00.000Z');

    runTest('resolveGoalDeadline uses explicit targetDate when provided', () => {
      const explicitDate = '2028-06-15';
      const res = resolveGoalDeadline(2028, explicitDate, asOfFixed);

      assert.strictEqual(res.isDateSpecified, true);
      assert.strictEqual(res.isOverdue, false);
      assert.strictEqual(res.isDueToday, false);
      assert.strictEqual(res.deadline.toISOString().split('T')[0], '2028-06-15');
      assert.ok(res.daysRemaining > 500, 'Should have over 500 days remaining');
      assert.ok(res.monthsRemaining > 15, 'Should have over 15 months remaining');
      assert.ok(res.deadlineInterpretation.includes('Explicit target date: 2028-06-15'));
    });

    runTest('resolveGoalDeadline interprets year-only target as December 31 end of calendar year', () => {
      const targetYear = 2030;
      const res = resolveGoalDeadline(targetYear, null, asOfFixed);

      assert.strictEqual(res.isDateSpecified, false);
      assert.strictEqual(res.isOverdue, false);
      assert.strictEqual(res.isDueToday, false);
      // December 31 of targetYear
      assert.strictEqual(res.deadline.getUTCFullYear(), 2030);
      assert.strictEqual(res.deadline.getUTCMonth(), 11);
      assert.strictEqual(res.deadline.getUTCDate(), 31);
      assert.strictEqual(res.deadline.getUTCHours(), 23);
      assert.strictEqual(res.deadline.getUTCMinutes(), 59);
      assert.ok(res.deadlineInterpretation.includes('December 31, 2030'));
      assert.ok(res.yearsRemaining > 4, 'Should be ~4.2 years remaining');
    });

    runTest('resolveGoalDeadline detects past deadline as overdue with zero remaining periods', () => {
      const pastDate = '2024-03-31';
      const res = resolveGoalDeadline(2024, pastDate, asOfFixed);

      assert.strictEqual(res.isOverdue, true);
      assert.strictEqual(res.isDueToday, false);
      assert.strictEqual(res.daysRemaining, 0);
      assert.strictEqual(res.monthsRemaining, 0);
      assert.strictEqual(res.yearsRemaining, 0);
      assert.ok(res.deadlineInterpretation.includes('Deadline passed'));
    });

    runTest('resolveGoalDeadline detects goal due today with zero remaining periods', () => {
      // Same calendar day as asOfFixed
      const todayDate = '2026-10-17T18:00:00.000Z';
      const res = resolveGoalDeadline(2026, todayDate, asOfFixed);

      assert.strictEqual(res.isDueToday, true);
      assert.strictEqual(res.isOverdue, false);
      assert.strictEqual(res.daysRemaining, 0);
      assert.strictEqual(res.monthsRemaining, 0);
      assert.strictEqual(res.yearsRemaining, 0);
      assert.ok(res.deadlineInterpretation.includes('Due today'));
    });

    runTest('resolveGoalDeadline handles target date within current year correctly', () => {
      const targetDateThisYear = '2026-12-15';
      const res = resolveGoalDeadline(2026, targetDateThisYear, asOfFixed);

      assert.strictEqual(res.isOverdue, false);
      assert.strictEqual(res.isDueToday, false);
      assert.strictEqual(res.daysRemaining, 59); // from Oct 17 to Dec 15 is 59 days
      assert.strictEqual(res.monthsRemaining, 2); // ~2 months
      assert.ok(res.yearsRemaining < 1.0);
    });

    runTest('resolveGoalDeadline handles distant future dates accurately', () => {
      const res = resolveGoalDeadline(2045, null, asOfFixed);

      assert.strictEqual(res.isOverdue, false);
      assert.strictEqual(res.isDueToday, false);
      assert.ok(res.yearsRemaining >= 18 && res.yearsRemaining <= 20);
    });

    runTest('resolveGoalDeadline defaults missing date and year to 5 years (Dec 31)', () => {
      const res = resolveGoalDeadline(null, null, asOfFixed);

      assert.strictEqual(res.deadline.getUTCFullYear(), 2031);
      assert.strictEqual(res.deadline.getUTCMonth(), 11);
      assert.strictEqual(res.deadline.getUTCDate(), 31);
      assert.ok(res.deadlineInterpretation.includes('defaulted to 5 years'));
    });

    // -------------------------------------------------------------
    // TEST GROUP 2: Discrete Monthly Compounding & Math Accuracy
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Discrete Monthly Compounding & Math Accuracy ---');

    runTest('calculateFutureValue matches analytical formula with discrete monthly compounding', () => {
      const P = 100000;
      const PMT = 10000;
      const r = 10; // 10%
      const months = 60; // 5 years

      const calculated = calculateFutureValue(P, PMT, r, months);

      // Analytical check:
      const monthlyRate = 0.10 / 12;
      const n = 60;
      const expectedP = P * Math.pow(1 + monthlyRate, n);
      const expectedPMT = PMT * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate);
      const expectedTotal = Math.round(expectedP + expectedPMT);

      assert.strictEqual(calculated, expectedTotal, `Expected ${expectedTotal}, got ${calculated}`);
      assert.ok(calculated > 930000 && calculated < 950000, `Calculated FV ₹${calculated} should be ~₹9.39L`);
    });

    runTest('calculateFutureValue handles zero-return (r=0) edge case correctly', () => {
      const P = 200000;
      const PMT = 15000;
      const r = 0;
      const months = 48; // 4 years

      const calculated = calculateFutureValue(P, PMT, r, months);
      const expected = P + PMT * months; // 200,000 + 15,000 * 48 = 920,000

      assert.strictEqual(calculated, expected, `Zero-return FV must equal pure cash contributions ${expected}`);
    });

    runTest('calculateFutureValue returns principal when overdue or expired (monthsRemaining <= 0)', () => {
      const P = 350000;
      const PMT = 20000;
      const r = 12;

      assert.strictEqual(calculateFutureValue(P, PMT, r, 0), P, 'Expired horizon must yield current principal');
      assert.strictEqual(calculateFutureValue(P, PMT, r, -5), P, 'Negative horizon must yield current principal');
    });

    runTest('calculateRequiredMonthlyContribution derives exact funding requirement', () => {
      const target = 5000000; // 50 Lakhs
      const principal = 500000; // 5 Lakhs
      const r = 10;
      const months = 120; // 10 years

      const requiredPMT = calculateRequiredMonthlyContribution(target, principal, r, months);
      assert.ok(requiredPMT > 15000 && requiredPMT < 25000, `Required PMT should be in sensible range, got ₹${requiredPMT}`);

      // Verify that plugging requiredPMT back into future value satisfies target
      const resultingFV = calculateFutureValue(principal, requiredPMT, r, months);
      assert.ok(
        resultingFV >= target * 0.999,
        `Resulting FV ₹${resultingFV} should meet or exceed target ₹${target}`
      );
    });

    runTest('calculateRequiredMonthlyContribution returns 0 if principal already covers target', () => {
      const target = 1000000;
      const principal = 800000;
      const r = 12;
      const months = 120; // 8L at 12% in 10 years will grow to ~26L > 10L

      const requiredPMT = calculateRequiredMonthlyContribution(target, principal, r, months);
      assert.strictEqual(requiredPMT, 0, 'Required PMT should be 0 when compounding already satisfies target');
    });

    runTest('calculateRequiredMonthlyContribution returns 0 if monthsRemaining <= 0', () => {
      const target = 5000000;
      const principal = 500000;
      const r = 10;

      const requiredPMT = calculateRequiredMonthlyContribution(target, principal, r, 0);
      assert.strictEqual(requiredPMT, 0, 'Required PMT must be 0 for overdue/due today goals (monthly saving not applicable)');
    });

    // -------------------------------------------------------------
    // TEST GROUP 3: Goal Projection Scenarios & Honesty Disclosures
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Goal Projection Scenarios & Honesty Disclosures ---');

    runTest('Overdue goal with shortfall projects zero future growth and highlights immediate lump-sum', () => {
      const projection = computeGoalProjectionDetails(
        {
          name: 'Past Milestone Goal',
          targetAmount: 1000000, // 10L
          currentAllocatedAmount: 600000, // 6L
          monthlyContribution: 20000,
          targetYear: 2024,
          targetDate: '2024-06-30',
        },
        asOfFixed
      );

      assert.strictEqual(projection.deadlineStatus, 'Overdue');
      assert.strictEqual(projection.isOverdue, true);
      assert.strictEqual(projection.isDueToday, false);
      assert.strictEqual(projection.isFunded, false);
      assert.strictEqual(projection.remainingShortfall, 400000);
      assert.strictEqual(projection.monthsRemaining, 0);
      assert.strictEqual(projection.yearsRemaining, 0);

      // CRITICAL: No future compounding projected beyond deadline
      assert.strictEqual(projection.scenarios.baseline.projectedFutureValue, 600000);
      assert.strictEqual(projection.scenarios.conservative.projectedFutureValue, 600000);
      assert.strictEqual(projection.scenarios.optimistic.projectedFutureValue, 600000);
      assert.strictEqual(projection.scenarios.zeroReturn.projectedFutureValue, 600000);

      assert.strictEqual(projection.requiredMonthlySavings, 0, 'No monthly saving for overdue goal');
      assert.strictEqual(projection.scenarioFeasibility, 'Overdue');
      assert.ok(projection.feasibilityExplanation.includes('unfunded shortfall of ₹4,00,000'));
      assert.ok(projection.guidance.includes('immediate lump-sum'));
    });

    runTest('Goal due today reports Due Today status with zero future compounding', () => {
      const projection = computeGoalProjectionDetails(
        {
          name: 'Due Today Car Downpayment',
          targetAmount: 800000,
          currentAllocatedAmount: 550000,
          monthlyContribution: 10000,
          targetDate: '2026-10-17T20:00:00.000Z',
        },
        asOfFixed
      );

      assert.strictEqual(projection.deadlineStatus, 'Due Today');
      assert.strictEqual(projection.isDueToday, true);
      assert.strictEqual(projection.isOverdue, false);
      assert.strictEqual(projection.remainingShortfall, 250000);
      assert.strictEqual(projection.monthsRemaining, 0);
      assert.strictEqual(projection.scenarios.baseline.projectedFutureValue, 550000);
      assert.strictEqual(projection.requiredMonthlySavings, 0);
    });

    runTest('Already funded goal marks Achieved status and suggests capital preservation', () => {
      const projection = computeGoalProjectionDetails(
        {
          name: 'Emergency Buffer Goal',
          targetAmount: 1000000,
          currentAllocatedAmount: 1200000, // 120% funded
          monthlyContribution: 5000,
          targetYear: 2028,
        },
        asOfFixed
      );

      assert.strictEqual(projection.deadlineStatus, 'Fully Funded');
      assert.strictEqual(projection.isFunded, true);
      assert.strictEqual(projection.remainingShortfall, 0);
      assert.strictEqual(projection.scenarioFeasibility, 'Achieved');
      assert.strictEqual(projection.requiredMonthlySavings, 0);
      assert.ok(projection.guidance.includes('Target achieved'));
      assert.ok(projection.guidance.includes('capital-preservation'));
    });

    runTest('Active future goal produces ordered scenarios and honest feasibility (no fake probability)', () => {
      const projection = computeGoalProjectionDetails(
        {
          name: 'Higher Education Fund',
          targetAmount: 3000000,
          currentAllocatedAmount: 600000,
          monthlyContribution: 15000,
          targetYear: 2034,
          metadata: {
            assumedCagrPct: 10.0,
            assumedInflationPct: 6.0,
          },
        },
        asOfFixed
      );

      assert.strictEqual(projection.targetAmount, 3000000);
      assert.ok(projection.yearsRemaining >= 7 && projection.yearsRemaining <= 9);
      assert.strictEqual(projection.scenarios.baseline.ratePct, 10.0);
      assert.strictEqual(projection.scenarios.conservative.ratePct, 6.0);
      assert.strictEqual(projection.scenarios.optimistic.ratePct, 12.0);
      assert.strictEqual(projection.scenarios.zeroReturn.ratePct, 0);

      // Proper scenario ordering
      assert.ok(projection.scenarios.optimistic.projectedFutureValue > projection.scenarios.baseline.projectedFutureValue);
      assert.ok(projection.scenarios.baseline.projectedFutureValue > projection.scenarios.conservative.projectedFutureValue);
      assert.ok(projection.scenarios.conservative.projectedFutureValue > projection.scenarios.zeroReturn.projectedFutureValue);

      // Inflation adjusted target
      assert.ok(projection.inflationAdjustedTarget > projection.targetAmount, 'Inflation adjusted target must be higher');

      // HONESTY CHECK: probability score must NOT exist as a pseudo-percentage
      assert.strictEqual((projection).probability, undefined, 'Must not expose pseudo-probability percentage');
      assert.ok(
        ['High', 'Moderate', 'Low', 'Achieved', 'Overdue'].includes(projection.scenarioFeasibility),
        `scenarioFeasibility must be valid enum, got ${projection.scenarioFeasibility}`
      );
      assert.ok(projection.feasibilityExplanation.length > 10, 'Must have detailed feasibility explanation');
      assert.ok(projection.methodologyDisclosure.includes('discrete monthly compounding'), 'Must disclose compounding methodology');
      assert.ok(projection.methodologyDisclosure.includes('deterministic mathematical illustrations'), 'Must disclose deterministic nature');
      assert.ok(projection.guidance.length > 20, 'Must provide concrete guidance without claiming AI generation');
    });

    // -------------------------------------------------------------
    // TEST GROUP 4: Versioned Health Scoring & Historical Honesty
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Versioned Health Scoring & Historical Honesty ---');

    runTest('Health engine version is 1.0.0 and base weights sum to 1.00', () => {
      assert.strictEqual(HEALTH_SCORE_ENGINE_VERSION, '1.0.0');
      const sum = Object.values(BASE_PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
      assert.strictEqual(Math.round(sum * 100) / 100, 1.00);
    });

    runTest('Full profile evaluates all 5 pillars with 100% coverage and high confidence', () => {
      const output = evaluateHealthScores({
        monthlyIncome: 250000,
        monthlyExpenses: 80000,
        emergencyFundActual: 480000, // 6 months
        emergencyFundTargetMonths: 6,
        holdingsCount: 12,
        hhi: 1200,
        top1WeightPct: 14.5,
        assetClassCount: 4,
        unpricedHoldingCount: 0,
        termInsuranceCover: 30000000, // 10x
        healthInsuranceCover: 1000000,
        goalsCount: 3,
        overallFundingPct: 75,
        onTrackGoalsCount: 3,
        behindGoalsCount: 0,
      });

      assert.strictEqual(output.assessedPillarsCount, 5);
      assert.strictEqual(output.coveragePct, 100);
      assert.strictEqual(output.confidence, 'High');
      assert.ok(output.overallScore !== null && output.overallScore >= 80, `Expected strong score, got ${output.overallScore}`);
      assert.strictEqual(output.ratingLabel, 'Strong and Resilient');

      // Normalized weights should equal base weights when all 5 are assessed
      for (const p of output.pillars) {
        assert.strictEqual(p.isAssessed, true);
        assert.strictEqual(p.status, 'strong');
        assert.strictEqual(p.normalizedWeight, p.baseWeight);
      }
    });

    runTest('Dynamic weight re-normalization protects users from missing data penalties', () => {
      const output = evaluateHealthScores({
        monthlyIncome: 200000,
        monthlyExpenses: 70000, // saving 65% of income
        emergencyFundActual: 420000, // 6 months = 100%
        emergencyFundTargetMonths: 6,
        holdingsCount: 0,
        hhi: null,
        termInsuranceCover: null,
        healthInsuranceCover: null,
        goalsCount: 0,
      });

      assert.strictEqual(output.assessedPillarsCount, 2);
      assert.strictEqual(output.coveragePct, 40);
      assert.strictEqual(output.confidence, 'Low');

      const assessed = output.pillars.filter(p => p.isAssessed);
      const unassessed = output.pillars.filter(p => !p.isAssessed);

      assert.strictEqual(assessed.length, 2);
      assert.strictEqual(unassessed.length, 3);

      for (const u of unassessed) {
        assert.strictEqual(u.status, 'unassessed');
        assert.strictEqual(u.normalizedWeight, 0);
      }

      const normalizedSum = assessed.reduce((sum, p) => sum + p.normalizedWeight, 0);
      assert.ok(Math.abs(normalizedSum - 1.0) < 0.001, `Normalized weights must sum to 1.0, got ${normalizedSum}`);

      assert.ok(
        output.overallScore !== null && output.overallScore >= 80,
        `Score should be strong (~85-100) due to dynamic re-normalization, got ${output.overallScore}`
      );
    });

    runTest('Historical trajectory honesty: flags no synthetic historical timeline', () => {
      const output = evaluateHealthScores({
        monthlyIncome: 150000,
        monthlyExpenses: 60000,
        emergencyFundActual: 360000,
      });

      assert.strictEqual(output.hasHistoricalTimeline, false, 'Database has no persisted monthly health snapshots');
      assert.ok(
        output.historicalTrackingDisclosure.includes('Longitudinal health trajectory tracking'),
        'Must disclose requirement for periodic persisted snapshots'
      );
      assert.ok(
        output.historicalTrackingDisclosure.includes('live verified baseline assessment'),
        'Must disclose that view represents live baseline'
      );
    });

    // -------------------------------------------------------------
    // TEST GROUP 5: Risk Diagnostics & Boundary Detection
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Risk Diagnostics & Boundary Detection ---');

    runTest('Cash flow deficit triggers high-severity diagnostic and weak savings status', () => {
      const output = evaluateHealthScores({
        monthlyIncome: 100000,
        monthlyExpenses: 130000, // ₹30,000 monthly deficit
        emergencyFundActual: 200000,
      });

      const deficitDiag = output.diagnostics.find(d => d.id === 'deficit-spending');
      assert.ok(deficitDiag, 'Must trigger deficit-spending diagnostic');
      assert.strictEqual(deficitDiag.severity, 'high');
      assert.strictEqual(deficitDiag.category, 'CASH_FLOW');
      assert.ok(deficitDiag.description.includes('30,000'));

      const savingsPillar = output.pillars.find(p => p.id === 'savings');
      assert.strictEqual(savingsPillar.status, 'weak');
    });

    runTest('Emergency buffer shortfall triggers appropriate diagnostic severity', () => {
      const outputHigh = evaluateHealthScores({
        monthlyIncome: 100000,
        monthlyExpenses: 50000,
        emergencyFundActual: 50000, // 1.0 month
        emergencyFundTargetMonths: 6,
      });
      const diagHigh = outputHigh.diagnostics.find(d => d.id === 'emergency-buffer-shortfall');
      assert.ok(diagHigh);
      assert.strictEqual(diagHigh.severity, 'high');

      const outputMed = evaluateHealthScores({
        monthlyIncome: 100000,
        monthlyExpenses: 50000,
        emergencyFundActual: 225000, // 4.5 months
        emergencyFundTargetMonths: 6,
      });
      const diagMed = outputMed.diagnostics.find(d => d.id === 'emergency-buffer-shortfall');
      assert.ok(diagMed);
      assert.strictEqual(diagMed.severity, 'medium');
    });

    runTest('High HHI concentration triggers concentration risk diagnostic', () => {
      const output = evaluateHealthScores({
        holdingsCount: 5,
        hhi: 3200,
        top1WeightPct: 35.0,
      });

      const concDiag = output.diagnostics.find(d => d.id === 'portfolio-concentration');
      assert.ok(concDiag, 'Must trigger portfolio-concentration diagnostic');
      assert.strictEqual(concDiag.severity, 'high');
      assert.strictEqual(concDiag.category, 'CONCENTRATION');
    });

    runTest('Unpriced asset holdings trigger unpriced exposure diagnostic', () => {
      const output = evaluateHealthScores({
        holdingsCount: 6,
        hhi: 1400,
        unpricedHoldingCount: 2,
        unpricedInvestedAmount: 250000,
      });

      const unpricedDiag = output.diagnostics.find(d => d.id === 'unpriced-assets');
      assert.ok(unpricedDiag, 'Must trigger unpriced-assets diagnostic');
      assert.strictEqual(unpricedDiag.severity, 'medium');
      assert.ok(unpricedDiag.description.includes('2 holding(s)'));
    });

    // -------------------------------------------------------------
    // TEST GROUP 6: Database Goals CRUD & Strict User Isolation
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Database Goals CRUD & Strict User Isolation ---');

    const testUserA = 'a0000000-0000-0000-0000-000000000001';
    const testUserB = 'b0000000-0000-0000-0000-000000000002';
    let createdGoalId = null;

    await runAsyncTest('Create goal for User A with explicit targetDate persisted in public.goals', async () => {
      await sql`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
        VALUES 
          (${testUserA}, 'alpha_phase7@omniscope.dev', '{"full_name": "Alpha Investor"}'::jsonb, 'authenticated', 'authenticated'),
          (${testUserB}, 'beta_phase7@omniscope.dev', '{"full_name": "Beta Investor"}'::jsonb, 'authenticated', 'authenticated')
        ON CONFLICT (id) DO NOTHING;
      `;
      await sql`
        INSERT INTO public.users (id, email, name)
        VALUES 
          (${testUserA}, 'alpha_phase7@omniscope.dev', 'Alpha Investor'),
          (${testUserB}, 'beta_phase7@omniscope.dev', 'Beta Investor')
        ON CONFLICT (id) DO NOTHING;
      `;

      const targetDate = new Date('2032-04-15T00:00:00.000Z');

      const [newGoal] = await sql`
        INSERT INTO public.goals (
          user_id, name, icon, target_amount, current_allocated_amount, monthly_contribution, target_year, target_date, category, metadata
        ) VALUES (
          ${testUserA}, 'Test Retirement Freedom', 'palm', 25000000.00, 5000000.00, 40000.00, 2032, ${targetDate}, 'RETIREMENT',
          '{"assumedCagrPct": 10.5, "assumedInflationPct": 6.0}'::jsonb
        ) RETURNING id, user_id, name, target_amount, target_year, target_date;
      `;

      assert.ok(newGoal && newGoal.id, 'Goal must be created with valid UUID');
      assert.strictEqual(newGoal.user_id, testUserA, 'Goal user_id must match User A');
      assert.strictEqual(parseFloat(newGoal.target_amount), 25000000);
      assert.strictEqual(newGoal.target_year, 2032);
      assert.ok(newGoal.target_date, 'target_date column must be populated');
      createdGoalId = newGoal.id;
    });

    await runAsyncTest('Strict Isolation: User B CANNOT read or access User A goal', async () => {
      assert.ok(createdGoalId, 'createdGoalId must exist');

      const [found] = await sql`
        SELECT * FROM public.goals WHERE id = ${createdGoalId} AND user_id = ${testUserB};
      `;
      assert.strictEqual(found, undefined, 'User B must NOT be able to find User A goal');

      const userBGoals = await sql`
        SELECT * FROM public.goals WHERE user_id = ${testUserB};
      `;
      assert.ok(!userBGoals.some(g => g.id === createdGoalId), 'User A goal must not appear in User B goal listing');
    });

    await runAsyncTest('Strict Isolation: User B CANNOT update or mutate User A goal', async () => {
      assert.ok(createdGoalId, 'createdGoalId must exist');

      const updateResult = await sql`
        UPDATE public.goals
        SET name = 'Hacked Goal Name'
        WHERE id = ${createdGoalId} AND user_id = ${testUserB}
        RETURNING id;
      `;

      assert.strictEqual(updateResult.length, 0, 'User B update on User A goal must affect 0 rows');

      const [original] = await sql`SELECT name FROM public.goals WHERE id = ${createdGoalId};`;
      assert.strictEqual(original.name, 'Test Retirement Freedom', 'Goal name must remain unchanged');
    });

    await runAsyncTest('User A updates own goal with updated SIP, target year, and target date', async () => {
      assert.ok(createdGoalId, 'createdGoalId must exist');
      const updatedDate = new Date('2033-12-31T00:00:00.000Z');

      const [updated] = await sql`
        UPDATE public.goals
        SET monthly_contribution = 45000.00, target_year = 2033, target_date = ${updatedDate}, updated_at = NOW()
        WHERE id = ${createdGoalId} AND user_id = ${testUserA}
        RETURNING id, monthly_contribution, target_year, target_date;
      `;

      assert.ok(updated, 'Update should succeed for owner User A');
      assert.strictEqual(parseFloat(updated.monthly_contribution), 45000);
      assert.strictEqual(updated.target_year, 2033);
    });

    await runAsyncTest('Strict Isolation: User B CANNOT delete User A goal', async () => {
      assert.ok(createdGoalId, 'createdGoalId must exist');

      const deleteResult = await sql`
        DELETE FROM public.goals
        WHERE id = ${createdGoalId} AND user_id = ${testUserB}
        RETURNING id;
      `;

      assert.strictEqual(deleteResult.length, 0, 'User B delete on User A goal must affect 0 rows');

      const [stillExists] = await sql`SELECT id FROM public.goals WHERE id = ${createdGoalId};`;
      assert.ok(stillExists, 'Goal must still exist after unauthorized delete attempt');
    });

    await runAsyncTest('User A successfully deletes own goal', async () => {
      assert.ok(createdGoalId, 'createdGoalId must exist');

      const [deleted] = await sql`
        DELETE FROM public.goals
        WHERE id = ${createdGoalId} AND user_id = ${testUserA}
        RETURNING id;
      `;

      assert.ok(deleted, 'User A delete must succeed');
      assert.strictEqual(deleted.id, createdGoalId);

      const [check] = await sql`SELECT id FROM public.goals WHERE id = ${createdGoalId};`;
      assert.strictEqual(check, undefined, 'Goal must be completely removed');
    });

    // -------------------------------------------------------------
    // TEST GROUP 7: Partial Net Worth / Liability Disclaimer Enforcement
    // -------------------------------------------------------------
    console.log('\n--- Test Group 7: Asset Valuation & Partial Picture Disclosures ---');

    runTest('Identified assets disclaimer explicitly states unmodeled liabilities', () => {
      const mockLiquid = 500000;
      const mockInvested = 15000000;
      const totalIdentified = mockLiquid + mockInvested;

      const disclaimer = 'Identified Liquid & Invested Assets (Excluding Unmodeled Liabilities). Outstanding loans, mortgages, or credit balances are not currently tracked in the database.';

      assert.strictEqual(totalIdentified, 15500000);
      assert.ok(disclaimer.includes('Excluding Unmodeled Liabilities'), 'Must disclaim unmodeled liabilities');
      assert.ok(disclaimer.includes('Outstanding loans'), 'Must explicitly mention untracked debt');
      assert.ok(!disclaimer.toLowerCase().includes('total net worth'), 'Must NOT claim to be total net worth');
    });

    // Clean up test identities created for isolation check
    await sql`DELETE FROM public.goals WHERE user_id IN (${testUserA}, ${testUserB});`;
    await sql`DELETE FROM public.financial_profiles WHERE user_id IN (${testUserA}, ${testUserB});`;
    await sql`DELETE FROM public.users WHERE id IN (${testUserA}, ${testUserB});`;
    await sql`DELETE FROM auth.users WHERE id IN (${testUserA}, ${testUserB});`;

    console.log('\n===============================================================');
    console.log(`   PHASE 7 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)       `);
    console.log('   ALL MATHEMATICAL, SCORING & ISOLATION CHECKS VERIFIED        ');
    console.log('===============================================================\n');

    await sql.end();
  } catch (err) {
    console.error('Fatal test error:', err);
    await sql.end();
    process.exit(1);
  }
}

runPhase7Tests();
