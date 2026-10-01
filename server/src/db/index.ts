import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

const isNeon = env.DATABASE_URL.includes('neon.tech');

/** Small pool for serverless / Vercel; Neon pooled URL recommended in production. */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isNeon ? 3 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: isNeon || env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (error) => {
  console.error('[db] Unexpected idle client error:', error.message);
});

export const db = drizzle({ client: pool, schema });
