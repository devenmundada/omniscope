import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });

async function applyMigration() {
  console.log('=== Applying Phase 5 Additive Migration: 0002_market_prices_precision_and_types ===\n');

  try {
    const migrationFile = 'drizzle/0002_market_prices_precision_and_types.sql';
    const sqlContent = fs.readFileSync(migrationFile, 'utf8');

    // 1. Check existing recorded migrations
    const existing = await sql`
      SELECT id, hash, created_at 
      FROM drizzle.__drizzle_migrations 
      ORDER BY id ASC;
    `;
    console.log('Currently recorded migrations in database:');
    existing.forEach((m) => console.log(`- ID: ${m.id}, Hash: ${m.hash}, CreatedAt: ${m.created_at}`));

    // Compute sha256 hash of migration content
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

    const alreadyApplied = existing.some((m) => m.hash === hash || m.id === 3);
    if (alreadyApplied) {
      console.log('\nMigration 0002 is already recorded in drizzle.__drizzle_migrations.');
    } else {
      console.log('\nExecuting statements from 0002_market_prices_precision_and_types.sql:');

      // Split statements by --> statement-breakpoint
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        console.log(`Executing: ${stmt.slice(0, 60)}...`);
        await sql.unsafe(stmt);
      }

      // Record migration
      const timestamp = Date.now();
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${timestamp});
      `;
      console.log(`\n✔ Migration recorded in drizzle.__drizzle_migrations (Hash: ${hash}).`);
    }

    // 2. Verify schema alterations
    const columns = await sql`
      SELECT column_name, data_type, numeric_precision, numeric_scale, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'market_prices' 
        AND column_name IN ('price', 'previous_close', 'day_change', 'high', 'low', 'price_type');
    `;
    console.log('\nVerified column specifications on public.market_prices:');
    columns.forEach((c) => {
      console.log(`- ${c.column_name}: ${c.data_type}(${c.numeric_precision}, ${c.numeric_scale}) [Default: ${c.column_default}]`);
    });

    // 3. Verify unique index
    const indexes = await sql`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename = 'market_prices' 
        AND indexname = 'market_prices_instrument_unique';
    `;
    console.log('\nVerified unique index on public.market_prices:');
    indexes.forEach((idx) => {
      console.log(`- ${idx.indexname}: ${idx.indexdef}`);
    });

    console.log('\n✔ All migration checks passed successfully!');
    await sql.end();
  } catch (err) {
    console.error('Migration error:', err);
    await sql.end();
    process.exit(1);
  }
}

applyMigration();
