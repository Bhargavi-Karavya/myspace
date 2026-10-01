/**
 * Phase 4.9 — pgvector similarity search over memories.embedding.
 * Requires a running PostgreSQL instance with the vector extension.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { MEMORY_SEARCH_DEFAULT_TOP_K } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  insertMemory,
  searchSimilarMemories,
  updateMemoryEmbedding,
  MemoryEmbeddingDimensionMismatchError,
} from '../repositories/memory.repository.js';
import { memorySearchRequestSchema } from '../validators/ai.validator.js';

const MARKER = 'phase49-memory-search';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

describe('memorySearchRequestSchema (Phase 4.9)', () => {
  it('rejects an empty query', () => {
    const parsed = memorySearchRequestSchema.safeParse({
      query: '   ',
      topK: 3,
    });
    assert.equal(parsed.success, false);
  });

  it('rejects a missing query', () => {
    const parsed = memorySearchRequestSchema.safeParse({ topK: 3 });
    assert.equal(parsed.success, false);
  });

  it('rejects invalid topK', () => {
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
      memorySearchRequestSchema.safeParse({ query: 'hello', topK: 51 })
        .success,
      false,
    );
  });

  it('accepts a valid query and trims whitespace', () => {
    const parsed = memorySearchRequestSchema.safeParse({
      query: '  What database do I prefer?  ',
      topK: 3,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.query, 'What database do I prefer?');
      assert.equal(parsed.data.topK, 3);
    }
  });

  it('defaults topK when omitted', () => {
    const parsed = memorySearchRequestSchema.safeParse({
      query: 'databases',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.topK, MEMORY_SEARCH_DEFAULT_TOP_K);
    }
  });
});

describe('searchSimilarMemories (requires PostgreSQL + pgvector)', () => {
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

  it('returns [] when no memories have embeddings', async () => {
    const saved = await insertMemory({
      content: `${MARKER} null-only row`,
      category: 'other',
      importance: 0.3,
    });
    const listed = await db
      .select({ id: memories.id })
      .from(memories)
      .where(like(memories.content, `${MARKER} null-only row`));
    for (const row of listed) {
      createdIds.push(row.id);
    }
    assert.ok(saved);

    // Search with a vector that would only match our fixture axis if embedded.
    // NULL-embedding rows must not appear.
    const results = await searchSimilarMemories(unitAt(10), 5);
    const marked = results.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 0);
  });

  it('ignores NULL embeddings and ranks by pgvector cosine distance', async () => {
    await insertMemory({
      content: `${MARKER} near postgres`,
      category: 'preference',
      importance: 0.8,
    });
    await insertMemory({
      content: `${MARKER} mid related`,
      category: 'preference',
      importance: 0.6,
    });
    await insertMemory({
      content: `${MARKER} far cooking`,
      category: 'other',
      importance: 0.4,
    });
    await insertMemory({
      content: `${MARKER} null embedding ignored`,
      category: 'preference',
      importance: 0.9,
    });

    const nearRows = await db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(like(memories.content, `%${MARKER}%`));

    const byContent = Object.fromEntries(
      nearRows.map((r) => [r.content, r.id]),
    );
    const nearId = byContent[`${MARKER} near postgres`]!;
    const midId = byContent[`${MARKER} mid related`]!;
    const farId = byContent[`${MARKER} far cooking`]!;
    const nullId = byContent[`${MARKER} null embedding ignored`]!;
    createdIds.push(nearId, midId, farId, nullId);

    await updateMemoryEmbedding(nearId, unitAt(0));
    await updateMemoryEmbedding(midId, unitAt(1));
    await updateMemoryEmbedding(farId, unitAt(2));
    // nullId left without embedding

    const query = unitAt(0);
    query[0] = 0.9;
    query[1] = Math.sqrt(1 - 0.9 ** 2);

    // Fetch enough rows so fixture ranking is visible among other DB memories.
    const results = await searchSimilarMemories(query, 50);
    const marked = results.filter((r) => r.content.includes(MARKER));

    assert.equal(marked.length, 3);
    assert.equal(marked[0]!.id, nearId);
    assert.equal(marked[1]!.id, midId);
    assert.equal(marked[2]!.id, farId);
    assert.ok(marked[0]!.similarity >= marked[1]!.similarity);
    assert.ok(marked[1]!.similarity >= marked[2]!.similarity);
    assert.ok(!marked.some((r) => r.id === nullId));

    for (const hit of marked) {
      assert.equal(
        Object.keys(hit).sort().join(','),
        'category,content,id,importance,similarity',
      );
      assert.ok(!('embedding' in hit));
      assert.ok(!('createdAt' in hit));
      assert.ok(!('updatedAt' in hit));
      assert.equal(typeof hit.similarity, 'number');
    }
  });

  it('respects topK', async () => {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));

    await insertMemory({
      content: `${MARKER} topk-a`,
      category: 'goal',
      importance: 0.5,
    });
    await insertMemory({
      content: `${MARKER} topk-b`,
      category: 'goal',
      importance: 0.5,
    });

    const rows = await db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(like(memories.content, `%${MARKER} topk%`));

    for (const row of rows) {
      createdIds.push(row.id);
      await updateMemoryEmbedding(
        row.id,
        unitAt(row.content.includes('topk-a') ? 5 : 6),
      );
    }

    const aId = rows.find((r) => r.content.includes('topk-a'))!.id;

    const top1 = await searchSimilarMemories(unitAt(5), 1);
    assert.equal(top1.length, 1);

    const ranked = await searchSimilarMemories(unitAt(5), 50);
    const marked = ranked.filter((r) => r.content.includes(MARKER));
    assert.ok(marked.length >= 1);
    assert.equal(marked[0]!.id, aId);
  });

  it('rejects wrong query embedding dimensions', async () => {
    await assert.rejects(
      () => searchSimilarMemories([1, 2, 3], 3),
      MemoryEmbeddingDimensionMismatchError,
    );
  });
});
