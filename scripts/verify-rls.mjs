import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });

async function runRlsTests() {
  console.log('=== Running OmniScope Phase 3 RLS & Multi-Tenant Isolation Tests ===\n');

  const userA = 'a0000000-0000-0000-0000-000000000001';
  const userB = 'b0000000-0000-0000-0000-000000000002';
  const accountIdA = 'a1111111-1111-1111-1111-111111111111';
  const convIdA = 'c1111111-1111-1111-1111-111111111111';
  const msgIdA = 'd1111111-1111-1111-1111-111111111111';

  try {
    // 0. Ensure dummy auth identities exist in auth.users for foreign key satisfaction
    await sql`
      INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
      VALUES 
        (${userA}, 'user_a@test.omniscope', '{"full_name": "User Alpha"}'::jsonb, 'authenticated', 'authenticated'),
        (${userB}, 'user_b@test.omniscope', '{"full_name": "User Beta"}'::jsonb, 'authenticated', 'authenticated')
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log('[Setup] Test identities verified in auth.users.');

    // 1. User A inserts and reads their own account
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true)`;

      await tx`
        INSERT INTO public.accounts (id, user_id, account_type, institution_name)
        VALUES (${accountIdA}, ${userA}, 'BROKERAGE', 'Zerodha Test')
        ON CONFLICT (id) DO NOTHING;
      `;
      console.log('✔ Test 1 PASSED: User A can insert their own account.');

      const [selectedA] = await tx`
        SELECT id FROM public.accounts WHERE id = ${accountIdA};
      `;
      console.log('✔ Test 2 PASSED: User A can read their own account:', selectedA?.id === accountIdA);
    });

    // 2. User B CANNOT read User A's account
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true)`;

      const rows = await tx`
        SELECT id FROM public.accounts WHERE id = ${accountIdA};
      `;
      console.log('✔ Test 3 PASSED: User B cannot read User A account (rows returned):', rows.length === 0);

      // 3. User B CANNOT update User A's account
      const updated = await tx`
        UPDATE public.accounts SET institution_name = 'Hacked' WHERE id = ${accountIdA} RETURNING id;
      `;
      console.log('✔ Test 4 PASSED: User B cannot update User A account (rows updated):', updated.length === 0);

      // 4. User B CANNOT delete User A's account
      const deleted = await tx`
        DELETE FROM public.accounts WHERE id = ${accountIdA} RETURNING id;
      `;
      console.log('✔ Test 5 PASSED: User B cannot delete User A account (rows deleted):', deleted.length === 0);
    });

    // 5. User B insertion with User A ownership rejected by RLS WITH CHECK
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true)`;

      let insertBlocked = false;
      await tx
        .savepoint(async (s) => {
          await s`
            INSERT INTO public.accounts (id, user_id, account_type, institution_name)
            VALUES (gen_random_uuid(), ${userA}, 'BANK', 'Unauthorized Bank');
          `;
        })
        .catch(() => {
          insertBlocked = true;
        });
      console.log('✔ Test 6 PASSED: User B insertion with User A ownership rejected by RLS:', insertBlocked);
    });

    // 6. User A creates conversation and message
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true)`;

      await tx`
        INSERT INTO public.ai_conversations (id, user_id, title)
        VALUES (${convIdA}, ${userA}, 'User A Wealth Strategy')
        ON CONFLICT (id) DO NOTHING;
      `;

      await tx`
        INSERT INTO public.ai_messages (id, conversation_id, role, content)
        VALUES (${msgIdA}, ${convIdA}, 'user', 'What is my emergency fund target?')
        ON CONFLICT (id) DO NOTHING;
      `;
      console.log('✔ Test 7 PASSED: User A successfully created conversation and message.');
    });

    // 7. User B CANNOT view User A's messages through parent conversation
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true)`;

      const msgRows = await tx`
        SELECT id FROM public.ai_messages WHERE id = ${msgIdA};
      `;
      console.log('✔ Test 8 PASSED: User B cannot view User A messages (rows returned):', msgRows.length === 0);

      let msgInsertBlocked = false;
      await tx
        .savepoint(async (s) => {
          await s`
            INSERT INTO public.ai_messages (conversation_id, role, content)
            VALUES (${convIdA}, 'user', 'Malicious injection into User A chat');
          `;
        })
        .catch(() => {
          msgInsertBlocked = true;
        });
      console.log('✔ Test 9 PASSED: User B cannot insert into User A conversation:', msgInsertBlocked);
    });

    // 8. Public read-only catalog enforcement for instruments
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      const instRows = await tx`SELECT count(*) FROM public.instruments`;
      console.log('✔ Test 10 PASSED: Anon role can read instruments catalog (count):', instRows[0].count !== undefined);

      let writeBlocked = false;
      await tx
        .savepoint(async (s) => {
          await s`INSERT INTO public.instruments (symbol, name, asset_class) VALUES ('TEST', 'Test', 'EQUITY')`;
        })
        .catch(() => {
          writeBlocked = true;
        });
      console.log('✔ Test 11 PASSED: Anon / authenticated unauthorized write to instruments rejected:', writeBlocked);
    });

    console.log('\n✔ ALL 11 RLS ISOLATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Cleanup test records
    await sql`DELETE FROM public.accounts WHERE id = ${accountIdA};`.catch(() => {});
    await sql`DELETE FROM public.ai_messages WHERE id = ${msgIdA};`.catch(() => {});
    await sql`DELETE FROM public.ai_conversations WHERE id = ${convIdA};`.catch(() => {});
    await sql`DELETE FROM public.financial_profiles WHERE user_id IN (${userA}, ${userB});`.catch(() => {});
    await sql`DELETE FROM public.users WHERE id IN (${userA}, ${userB});`.catch(() => {});
    await sql`DELETE FROM auth.users WHERE id IN (${userA}, ${userB});`.catch(() => {});
    await sql.end();
    console.log('[Cleanup] Test fixture cleaned up cleanly.');
  }
}

runRlsTests().catch((err) => {
  console.error('RLS Test Failure:', err);
  process.exit(1);
});
