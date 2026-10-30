import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __wwPool?: Pool; __wwDb?: DB };

/**
 * pg 8 treats `sslmode=require` as verify-full. DigitalOcean managed Postgres
 * (App Platform) puts `sslmode=require` in DATABASE_URL and signs the certificate
 * with its own CA, so verification fails and the app never becomes healthy.
 * `uselibpqcompat=true` restores libpq's meaning of require: encrypt, don't verify
 * that private CA. Local and droplet URLs have no sslmode, so they are unchanged.
 * `sslmode=verify-full` and any URL that already pins `sslrootcert` are unchanged.
 */
export function databaseUrlForPool(url: string): string {
  if (!/[?&]sslmode=require(?:&|$)/.test(url)) return url;
  if (/[?&]uselibpqcompat=/.test(url) || /[?&]sslrootcert=/.test(url)) return url;
  return `${url}&uselibpqcompat=true`;
}

export function getDb(): DB {
  if (!globalForDb.__wwDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.__wwPool = new Pool({ connectionString: databaseUrlForPool(url), max: 10 });
    globalForDb.__wwDb = drizzle(globalForDb.__wwPool, { schema });
  }
  return globalForDb.__wwDb;
}

export async function closeDb() {
  if (globalForDb.__wwPool) {
    await globalForDb.__wwPool.end();
    globalForDb.__wwPool = undefined;
    globalForDb.__wwDb = undefined;
  }
}

export { schema };
