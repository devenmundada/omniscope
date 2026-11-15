import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function checkDetails() {
  try {
    const [prices] = await sql`SELECT count(*)::int as count FROM public.market_prices;`;
    console.log('Total market_prices:', prices.count);

    const [instruments] = await sql`SELECT count(*)::int as count FROM public.instruments;`;
    console.log('Total instruments:', instruments.count);

    const [holdings] = await sql`SELECT count(*)::int as count FROM public.holdings;`;
    console.log('Total holdings:', holdings.count);

    const [accounts] = await sql`SELECT count(*)::int as count FROM public.accounts;`;
    console.log('Total accounts:', accounts.count);

    const migrations = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC;`;
    console.log('Current migrations in drizzle.__drizzle_migrations:');
    migrations.forEach((m) => console.log(`  - ID: ${m.id}, Hash: ${m.hash}, CreatedAt: ${m.created_at}`));

    const sources = await sql`SELECT source, price_type, count(*)::int as count FROM public.market_prices GROUP BY source, price_type ORDER BY source;`;
    console.log('Distinct sources in market_prices:');
    sources.forEach((s) => console.log(`  - Source: ${s.source}, Type: ${s.price_type}, Count: ${s.count}`));

    await sql.end();
  } catch (err) {
    console.error('Error:', err);
    await sql.end();
  }
}

checkDetails();
