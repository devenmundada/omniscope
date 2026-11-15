import fs from 'fs';
import Module from 'module';
import dotenv from 'dotenv';
import postgres from 'postgres';

// Mock 'server-only' so CLI script can run Drizzle db connection outside Next.js bundler
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === 'server-only') return {};
  return originalRequire.apply(this, arguments);
};

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

// Ensure process.env is populated for Drizzle and provider
Object.assign(process.env, env);

async function runCliSync() {
  console.log('===============================================================');
  console.log('   OMNISCOPE PHASE 5: LIVE MARKET DATA & AMFI NAV SYNC         ');
  console.log('===============================================================\n');

  try {
    const { syncAllMarketPrices } = await import('../lib/market-data/sync-service.ts');
    
    console.log('Starting market data sync across verified instruments catalogue...\n');
    const result = await syncAllMarketPrices();

    console.log('---------------------------------------------------------------');
    console.log(`Sync Result Summary:`);
    console.log(`- Total Instruments Processed: ${result.totalProcessed}`);
    console.log(`- Successfully Updated Prices: ${result.updatedCount}`);
    console.log(`- Skipped / Unchanged:        ${result.skippedCount}`);
    console.log(`- Failed / Provider Errors:   ${result.failedCount}`);
    console.log(`- Completed At:               ${result.syncedAt.toISOString()}`);
    console.log('---------------------------------------------------------------\n');

    if (result.errors.length > 0) {
      console.log('Provider Notices / Warnings:');
      result.errors.forEach(e => console.log(`  [${e.identifier}] ${e.error}`));
      console.log('');
    }

    // Query database to display sample verified prices
    const sql = postgres(env.DATABASE_URL, { max: 1 });
    const samplePrices = await sql`
      SELECT 
        i.symbol, 
        i.name, 
        i.asset_class, 
        p.price, 
        p.price_type, 
        p.source, 
        p.price_timestamp,
        p.day_change_pct
      FROM public.market_prices p
      JOIN public.instruments i ON p.instrument_id = i.id
      ORDER BY i.asset_class, i.symbol;
    `;

    console.log(`Verified Market Prices in Database (${samplePrices.length} records):`);
    samplePrices.forEach(p => {
      const formattedDate = new Date(p.price_timestamp).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      console.log(`- [${p.asset_class.padEnd(14)}] ${p.symbol.padEnd(12)}: ₹${Number(p.price).toFixed(4).padStart(10)} (${p.price_type}, ${p.source}) As of ${formattedDate}`);
    });

    await sql.end();
    console.log('\n✔ Market data sync completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Fatal sync error:', err);
    process.exit(1);
  }
}

runCliSync();
