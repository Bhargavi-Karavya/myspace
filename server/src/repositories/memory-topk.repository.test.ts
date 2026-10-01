/**
 * Phase 4.12 — Top-K retrieval behavior for memory semantic search.
 * PostgreSQL applies LIMIT; integration tests use deterministic unit vectors.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like } from 'drizzle-orm';
import {
  EMBEDDING_EXPERIMENT_DIMENSIONS,
  MEMORY_SEARCH_DEFAULT_TOP_K,
  MEMORY_SEARCH_MAX_TOP_K,
} from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  insertMemory,
  searchSimilarMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';
import { memorySearchRequestSchema } from '../validators/ai.validator.js';

const MARKER = 'phase412-topk';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

describe('memorySearchRequestSchema Top-K validation (Phase 4.12)', () => {
  it('defaults topK when omitted', () => {
    const parsed = memorySearchRequestSchema.safeParse({ query: 'hello' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.topK, MEMORY_SEARCH_DEFAULT_TOP_K);
    }
  });

  it('accepts explicit topK 1, 2, and 3', () => {
    for (const topK of [1, 2, 3]) {
      const parsed = memorySearchRequestSchema.safeParse({
        query: 'hello',
        topK,
      });
      assert.equal(parsed.success, true, String(topK));
      if (parsed.success) {
        assert.equal(parsed.data.topK, topK);
      }
    }
  });

  it('rejects topK = 0, negative, fractional, string, null, and above max', () => {
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: 0 })
        .success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: -1 })
        .success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: 1.5 })
        .success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: '3' })
        .success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: null })
        .success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({
        query: 'hello',
        topK: MEMORY_SEARCH_MAX_TOP_K + 1,
      }).success,
      false,
    );
  });
});

describe('searchSimilarMemories Top-K LIMIT (requires PostgreSQL + pgvector)', () => {
  const createdIds: string[] = [];

  before(async () => {
    await db.select({ id: memories.id }).from(memories).limit(1);
  });

  after(async () => {
    for (const id of createdIds) {
      await deleteMemoryById(id);
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
  });

  async function seedThreePreferencePlusNull() {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));

    await insertMemory({
      content: `${MARKER} near`,
      category: 'preference',
      importance: 0.9,
    });
    await insertMemory({
      content: `${MARKER} mid`,
      category: 'preference',
      importance: 0.7,
    });
    await insertMemory({
      content: `${MARKER} far`,
      category: 'preference',
      importance: 0.5,
    });
    await insertMemory({
      content: `${MARKER} null`,
      category: 'preference',
      importance: 0.4,
    });
    await insertMemory({
      content: `${MARKER} other-cat`,
      category: 'professional',
      importance: 0.8,
    });

    const rows = await db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(like(memories.content, `%${MARKER}%`));

    const byContent = Object.fromEntries(rows.map((r) => [r.content, r.id]));
    createdIds.push(...rows.map((r) => r.id));

    await updateMemoryEmbedding(byContent[`${MARKER} near`]!, unitAt(0));
    await updateMemoryEmbedding(byContent[`${MARKER} mid`]!, unitAt(1));
    await updateMemoryEmbedding(byContent[`${MARKER} far`]!, unitAt(2));
    await updateMemoryEmbedding(byContent[`${MARKER} other-cat`]!, unitAt(0));
    // null left without embedding

    const query = unitAt(0);
    query[0] = 0.9;
    query[1] = Math.sqrt(1 - 0.9 ** 2);

    return { byContent, query };
  }

  it('topK=1 returns at most one row, highest similarity first', async () => {
    const { byContent, query } = await seedThreePreferencePlusNull();
    const results = await searchSimilarMemories(query, 1, 'preference');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, byContent[`${MARKER} near`]);
    assert.equal(results[0]!.category, 'preference');
    assert.ok(!('embedding' in results[0]!));
  });

  it('topK=2 and topK=3 return ordered preference matches only', async () => {
    const { byContent, query } = await seedThreePreferencePlusNull();

    const two = await searchSimilarMemories(query, 2, 'preference');
    assert.equal(two.length, 2);
    assert.deepEqual(
      two.map((r) => r.id),
      [byContent[`${MARKER} near`], byContent[`${MARKER} mid`]],
    );
    assert.ok(two[0]!.similarity >= two[1]!.similarity);

    const three = await searchSimilarMemories(query, 3, 'preference');
    assert.equal(three.length, 3);
    assert.deepEqual(
      three.map((r) => r.id),
      [
        byContent[`${MARKER} near`],
        byContent[`${MARKER} mid`],
        byContent[`${MARKER} far`],
      ],
    );
    assert.ok(
      !three.some((r) => r.id === byContent[`${MARKER} null`]),
    );
    assert.ok(
      !three.some((r) => r.id === byContent[`${MARKER} other-cat`]),
    );
  });

  it('topK larger than available matching rows returns all matches', async () => {
    const { query } = await seedThreePreferencePlusNull();
    const results = await searchSimilarMemories(query, 10, 'preference');
    const marked = results.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 3);
    assert.ok(marked.length < 10);
  });

  it('returns [] when no matching embedded memories exist', async () => {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    await insertMemory({
      content: `${MARKER} only-null`,
      category: 'goal',
      importance: 0.2,
    });
    const [row] = await db
      .select({ id: memories.id })
      .from(memories)
      .where(like(memories.content, `${MARKER} only-null`));
    createdIds.push(row!.id);

    const results = await searchSimilarMemories(unitAt(7), 5, 'goal');
    const marked = results.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 0);
  });

  it('category + topK together limit in PostgreSQL', async () => {
    const { byContent, query } = await seedThreePreferencePlusNull();
    const results = await searchSimilarMemories(query, 1, 'professional');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, byContent[`${MARKER} other-cat`]);
    assert.equal(results[0]!.category, 'professional');
  });

  it('rejects repository topK above maximum', async () => {
    await assert.rejects(
      () =>
        searchSimilarMemories(
          unitAt(0),
          MEMORY_SEARCH_MAX_TOP_K + 1,
        ),
      /topK must be at most/,
    );
  });
});
