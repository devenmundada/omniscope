/**
 * Applies idempotent SQL patches from db/patches in filename order.
 * Runs automatically during the Vercel build (see "vercel-build" in package.json).
 * Skips silently when DATABASE_URL is not available (e.g. local builds without a database).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('[db-patches] DATABASE_URL not set; skipping schema patches.');
  process.exit(0);
}

const dir = join(process.cwd(), 'db', 'patches');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });

try {
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    await sql.unsafe(text);
    console.log(`[db-patches] applied ${f}`);
  }
} catch (err) {
  console.error('[db-patches] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
