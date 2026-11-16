import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let client: postgres.Sql | null = null;

/**
 * Supabase's session pooler (port 5432) admits only `pool_size` (15) clients in total, and every warm
 * serverless instance keeps its connections until the instance is recycled, so a few concurrent
 * instances exhaust it ("max clients reached in session mode") and every page fails. The transaction
 * pooler (port 6543, same credentials) shares server connections per transaction and is Supabase's
 * recommendation for serverless. Works with prepare: false and ordinary transactions.
 */
export function toTransactionPooler(connectionString: string): string {
  return connectionString.replace(/(\.pooler\.supabase\.com):5432(?=[/?]|$)/, '$1:6543');
}
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Returns the singleton Drizzle database instance.
 * Initializes the Postgres client lazily on first access to avoid connection attempts during static Next.js builds.
 */
export function getDb() {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not defined. Please configure DATABASE_URL in your .env.local file.'
      );
    }

    client = postgres(toTransactionPooler(connectionString), {
      max: process.env.NODE_ENV === 'production' ? 5 : 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // Recommended for connection poolers like Supabase/Neon/PgBouncer
    });

    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

/**
 * Convenient proxy export allowing `import { db } from '@/lib/db'` while strictly deferring
 * connection initialization until a database method is called.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export * from './schema';
