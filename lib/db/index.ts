import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let client: postgres.Sql | null = null;
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

    client = postgres(connectionString, {
      max: process.env.NODE_ENV === 'production' ? 10 : 1,
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
