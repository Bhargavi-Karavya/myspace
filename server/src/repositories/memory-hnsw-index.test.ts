/**
 * Phase 4.10 — HNSW vector index on memories.embedding.
 * Verifies migration + PostgreSQL metadata; reuse Phase 4.9 search fixtures for
 * ranking/topK/NULL behavior (search query unchanged).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like, sql } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  insertMemory,
  searchSimilarMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';

const MARKER = 'phase410-hnsw-index';

const TEST_USER_ID = 'test-user-phase49';
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  '../../drizzle/0004_normal_meltdown.sql',
);

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

describe('Phase 4.10 HNSW migration file', () => {
  it('defines a single HNSW cosine index on memories.embedding', () => {
    const sqlText = readFileSync(MIGRATION_PATH, 'utf8');
    assert.match(
      sqlText,
      /CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw/,
    );
    assert.match(sqlText, /halfvec\(3072\)/);
    assert.match(sqlText, /halfvec_cosine_ops/);
    // Exactly one CREATE INDEX in this migration — no second vector index.
    assert.equal(
      (sqlText.match(/CREATE INDEX/gi) ?? []).length,
      1,
    );
  });
});

describe('Phase 4.10 HNSW index in PostgreSQL (requires pgvector)', () => {
  const createdIds: string[] = [];

  before(async () => {
    await db.select({ id: memories.id }).from(memories).limit(1);
  });

  after(async () => {
    for (const id of createdIds) {
      await deleteMemoryById(id, TEST_USER_ID);
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
  });

  it('reports memories_embedding_hnsw_idx as the only vector index', async () => {
    const rows = await db.execute<{
      indexname: string;
      indexdef: string;
    }>(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'memories'
      ORDER BY indexname
    `);

    const indexes = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: { indexname: string; indexdef: string }[] }).rows ??
        []);

    const names = indexes.map((r) => r.indexname);
    assert.ok(names.includes('memories_pkey'));
    assert.ok(names.includes('memories_embedding_hnsw_idx'));

    const hnsw = indexes.find((r) => r.indexname === 'memories_embedding_hnsw_idx');
    assert.ok(hnsw);
    assert.match(hnsw!.indexdef, /USING hnsw/i);
    assert.match(hnsw!.indexdef, /halfvec\(3072\)/i);
    assert.match(hnsw!.indexdef, /halfvec_cosine_ops/i);

    const vectorIndexes = indexes.filter((r) =>
      /hnsw|ivfflat|vector_/i.test(r.indexdef),
    );
    assert.equal(vectorIndexes.length, 1);
  });

  it('still allows NULL embeddings after the index exists', async () => {
    await insertMemory({
      content: `${MARKER} null embedding ok`,
      category: 'other',
      importance: 0.25,
      userId: TEST_USER_ID,
    });
    const [row] = await db
      .select({
        id: memories.id,
        embedding: memories.embedding,
      })
      .from(memories)
      .where(like(memories.content, `${MARKER} null embedding ok`))
      .limit(1);

    assert.ok(row);
    createdIds.push(row!.id);
    assert.equal(row!.embedding, null);
  });

  it('keeps semantic search ordered by cosine distance with topK and no raw vector', async () => {
    await insertMemory({
      content: `${MARKER} near`,
      category: 'preference',
      importance: 0.7,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} mid`,
      category: 'preference',
      importance: 0.5,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} far`,
      category: 'other',
      importance: 0.3,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} null-skip`,
      category: 'preference',
      importance: 0.9,
      userId: TEST_USER_ID,
    });

    const rows = await db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(like(memories.content, `%${MARKER}%`));

    const byContent = Object.fromEntries(rows.map((r) => [r.content, r.id]));
    const nearId = byContent[`${MARKER} near`]!;
    const midId = byContent[`${MARKER} mid`]!;
    const farId = byContent[`${MARKER} far`]!;
    const nullId = byContent[`${MARKER} null-skip`]!;
    createdIds.push(nearId, midId, farId, nullId);

    await updateMemoryEmbedding(nearId, unitAt(0), TEST_USER_ID);
    await updateMemoryEmbedding(midId, unitAt(1), TEST_USER_ID);
    await updateMemoryEmbedding(farId, unitAt(2), TEST_USER_ID);

    const query = unitAt(0);
    query[0] = 0.9;
    query[1] = Math.sqrt(1 - 0.9 ** 2);

    const top1 = await searchSimilarMemories(query, 1, { userId: TEST_USER_ID });
    assert.equal(top1.length, 1);

    const ranked = await searchSimilarMemories(query, 50, { userId: TEST_USER_ID });
    const marked = ranked.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 3);
    assert.equal(marked[0]!.id, nearId);
    assert.equal(marked[1]!.id, midId);
    assert.equal(marked[2]!.id, farId);
    assert.ok(marked[0]!.similarity >= marked[1]!.similarity);
    assert.ok(!marked.some((r) => r.id === nullId));

    for (const hit of marked) {
      assert.equal(
        Object.keys(hit).sort().join(','),
        'category,content,id,importance,similarity',
      );
      assert.ok(!('embedding' in hit));
    }
  });
});
