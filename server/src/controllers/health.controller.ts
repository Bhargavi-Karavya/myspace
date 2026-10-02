import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getEnvStatus } from '../config/env.js';
import { db } from '../db/index.js';

export function getHealth(_request: Request, response: Response) {
  const status = getEnvStatus();

  if (!status.ok) {
    response.status(503).json({
      status: 'misconfigured',
      missing: status.missing,
      hint: 'Set these in Vercel → Settings → Environment Variables, then Redeploy.',
    });
    return;
  }

  response.status(200).json({ status: 'ok' });
}

export async function getDatabaseHealth(_request: Request, response: Response) {
  const status = getEnvStatus();
  if (!status.ok) {
    response.status(503).json({
      status: 'misconfigured',
      database: 'not_configured',
      missing: status.missing,
    });
    return;
  }

  try {
    await db.execute(sql`SELECT 1`);
    response.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[health/db]', message);
    response.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: message,
    });
  }
}

/**
 * One-shot schema bootstrap for Neon when local migrate can't reach the DB.
 * Safe to re-run: ignores "already exists" errors.
 */
const MIGRATION_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `DO $$ BEGIN
    CREATE TYPE "public"."memory_category" AS ENUM('preference', 'professional', 'personal', 'goal', 'other');
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE TABLE IF NOT EXISTS "memories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "content" text NOT NULL,
    "category" "memory_category" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "importance" double precision DEFAULT 0.5 NOT NULL`,
  `DO $$ BEGIN
    ALTER TABLE "memories" ADD CONSTRAINT "memories_importance_range"
      CHECK ("memories"."importance" >= 0 AND "memories"."importance" <= 1);
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE TABLE IF NOT EXISTS "embedding_experiments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "text" text NOT NULL,
    "embedding" vector(3072) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "embedding" vector(3072)`,
  `DO $$ BEGIN
    CREATE INDEX "memories_embedding_hnsw_idx" ON "memories"
      USING hnsw (("embedding"::halfvec(3072)) halfvec_cosine_ops);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
    CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE TABLE IF NOT EXISTS "conversations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "role" "message_role" NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `DO $$ BEGIN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE INDEX IF NOT EXISTS "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at")`,
  `CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at")`,
];

export async function runSchemaMigrate(request: Request, response: Response) {
  const expected = process.env.MIGRATE_SECRET;
  const provided = request.header('x-migrate-secret');

  if (!expected || !provided || provided !== expected) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const status = getEnvStatus();
  if (!status.ok) {
    response.status(503).json({
      status: 'misconfigured',
      missing: status.missing,
    });
    return;
  }

  const results: Array<{ ok: boolean; detail: string }> = [];

  for (const statement of MIGRATION_STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
      results.push({ ok: true, detail: statement.slice(0, 80).replace(/\s+/g, ' ') });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists|duplicate/i.test(message)) {
        results.push({ ok: true, detail: `exists: ${message.slice(0, 120)}` });
      } else {
        results.push({ ok: false, detail: message.slice(0, 240) });
      }
    }
  }

  const failed = results.filter((row) => !row.ok);
  response.status(failed.length ? 500 : 200).json({
    status: failed.length ? 'partial_failure' : 'ok',
    applied: results.length,
    failed: failed.length,
    results,
  });
}
