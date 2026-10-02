import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../config/env.js';
import * as schema from './schema/index.js';

type AppDatabase = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let database: AppDatabase | undefined;

function getPool(): Pool {
  if (pool) return pool;

  const databaseUrl = getEnv().DATABASE_URL;
  const isNeon = databaseUrl.includes('neon.tech');

  pool = new Pool({
    connectionString: databaseUrl,
    max: isNeon ? 3 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      isNeon || databaseUrl.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  pool.on('error', (error) => {
    console.error('[db] Unexpected idle client error:', error.message);
  });

  return pool;
}

function getDatabase(): AppDatabase {
  if (!database) {
    database = drizzle({ client: getPool(), schema });
  }
  return database;
}

/** Lazy DB — created on first query so `/api/health` can boot without env. */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDatabase(), property, receiver);
    return typeof value === 'function' ? value.bind(getDatabase()) : value;
  },
});
