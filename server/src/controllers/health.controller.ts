import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export function getHealth(_request: Request, response: Response) {
  response.status(200).json({ status: 'ok' });
}

export async function getDatabaseHealth(_request: Request, response: Response) {
  await db.execute(sql`SELECT 1`);
  response.status(200).json({ status: 'ok', database: 'connected' });
}
