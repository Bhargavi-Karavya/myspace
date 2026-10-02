/**
 * Phase 5.2/5.4 — relevant-context retrieval tests.
 * Unit tests use injectable deps (no Gemini). Integration tests use
 * PostgreSQL + pgvector with deterministic unit-vector fixtures.
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
import { MEMORY_CATEGORIES } from '../memory/categories.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  insertMemory,
  listMemories,
  updateMemoryEmbedding,
  type MemorySimilarityHit,
} from '../repositories/memory.repository.js';
import { ragRetrieveRequestSchema } from '../validators/ai.validator.js';
import {
  EmbeddingModelUnavailableError,
  EmbeddingOutputError,
} from './embedding.service.js';
import type { QueryEmbeddingResult } from './query-embedding.service.js';
import {
  MemoryEmbeddingDimensionMismatchError,
  retrieveRelevantContext,
  retrieveRelevantMemories,
} from './rag-retrieval.service.js';

const MARKER = 'phase54-relevant-context';

const TEST_USER_ID = 'test-user-phase49';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

function mockQueryEmbedding(
  axis: number,
  query = 'query',
): QueryEmbeddingResult {
  return {
    query,
    dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
    vector: unitAt(axis),
  };
}

function hit(
  partial: Partial<MemorySimilarityHit> &
    Pick<MemorySimilarityHit, 'id' | 'content'>,
): MemorySimilarityHit {
  return {
    category: 'professional',
    importance: 0.5,
    similarity: 0.9,
    ...partial,
  };
}

function normalizeMockQuery(q: unknown): string {
  return typeof q === 'string' ? q.trim() : 'query';
}

describe('ragRetrieveRequestSchema validation (Phase 5.2/5.4 → 400)', () => {
  it('rejects an empty query', () => {
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: '' }).success,
      false,
    );
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: '   ' }).success,
      false,
    );
  });

  it('rejects a missing query', () => {
    assert.equal(ragRetrieveRequestSchema.safeParse({}).success, false);
  });

  it('rejects invalid topK', () => {
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: 'hello', topK: 0 }).success,
      false,
    );
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: 'hello', topK: -1 }).success,
      false,
    );
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: 'hello', topK: 1.5 })
        .success,
      false,
    );
    assert.equal(
      ragRetrieveRequestSchema.safeParse({ query: 'hello', topK: '3' })
        .success,
      false,
    );
    assert.equal(
      ragRetrieveRequestSchema.safeParse({
        query: 'hello',
        topK: MEMORY_SEARCH_MAX_TOP_K + 1,
      }).success,
      false,
    );
  });

  it('rejects an invalid category', () => {
    const parsed = ragRetrieveRequestSchema.safeParse({
      query: 'hello',
      category: 'not-a-category',
    });
    assert.equal(parsed.success, false);
  });

  it('accepts a valid query, defaults topK, and optional category', () => {
    const parsed = ragRetrieveRequestSchema.safeParse({
      query: '  What database do I usually prefer?  ',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.query, 'What database do I usually prefer?');
      assert.equal(parsed.data.topK, MEMORY_SEARCH_DEFAULT_TOP_K);
      assert.equal(parsed.data.category, undefined);
    }
  });

  it('accepts each known memory category', () => {
    for (const category of MEMORY_CATEGORIES) {
      const parsed = ragRetrieveRequestSchema.safeParse({
        query: 'hello',
        category,
        topK: 3,
      });
      assert.equal(parsed.success, true, category);
    }
  });
});

describe('retrieveRelevantContext unit behavior (Phase 5.4)', () => {
  it('A: returns ranked context candidates with similarity and no raw vectors', async () => {
    let embedCalled = false;
    const result = await retrieveRelevantContext({ query: 'What database do I usually prefer?', topK: 5,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) => {
          embedCalled = true;
          return mockQueryEmbedding(0, normalizeMockQuery(q));
        },
        searchMemories: async (_embedding, topK) => {
          assert.equal(topK, 5);
          return [
            hit({
              id: '00000000-0000-4000-8000-000000000001',
              content: 'User prefers PostgreSQL for backend projects.',
              category: 'professional',
              importance: 0.75,
              similarity: 0.76,
            }),
            hit({
              id: '00000000-0000-4000-8000-000000000002',
              content: 'User likes Redis for caching.',
              category: 'preference',
              importance: 0.5,
              similarity: 0.55,
            }),
          ];
        },
      },
    );

    assert.equal(embedCalled, true);
    assert.equal(result.query, 'What database do I usually prefer?');
    assert.equal(result.memories.length, 2);
    assert.equal(
      result.memories[0]!.content,
      'User prefers PostgreSQL for backend projects.',
    );
    assert.equal(result.memories[0]!.similarity, 0.76);
    assert.ok('memories' in result);
    assert.ok(!('results' in result));
    for (const row of result.memories) {
      assert.ok(!('embedding' in row));
      assert.ok(!('vector' in row));
    }
  });

  it('B: keeps multiple memories ordered by similarity descending', async () => {
    const result = await retrieveRelevantContext({ query: 'databases', topK: 5,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
        searchMemories: async () => [
          hit({
            id: '00000000-0000-4000-8000-000000000041',
            content: 'PostgreSQL',
            similarity: 0.9,
          }),
          hit({
            id: '00000000-0000-4000-8000-000000000042',
            content: 'Redis',
            similarity: 0.7,
          }),
          hit({
            id: '00000000-0000-4000-8000-000000000043',
            content: 'SQLite',
            similarity: 0.6,
          }),
        ],
      },
    );

    assert.equal(result.memories.length, 3);
    for (let i = 1; i < result.memories.length; i += 1) {
      assert.ok(
        result.memories[i - 1]!.similarity >= result.memories[i]!.similarity,
      );
    }
  });

  it('C: respects topK when searching', async () => {
    let receivedTopK: number | undefined;
    await retrieveRelevantContext({ query: 'query', topK: 1,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(1, normalizeMockQuery(q)),
        searchMemories: async (_embedding, topK) => {
          receivedTopK = topK;
          return [
            hit({
              id: '00000000-0000-4000-8000-000000000011',
              content: 'a',
              similarity: 0.9,
            }),
          ];
        },
      },
    );
    assert.equal(receivedTopK, 1);

    receivedTopK = undefined;
    await retrieveRelevantContext({ query: 'query', topK: 3,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(1, normalizeMockQuery(q)),
        searchMemories: async (_embedding, topK) => {
          receivedTopK = topK;
          return [
            hit({
              id: '00000000-0000-4000-8000-000000000012',
              content: 'a',
              similarity: 0.9,
            }),
            hit({
              id: '00000000-0000-4000-8000-000000000013',
              content: 'b',
              similarity: 0.8,
            }),
            hit({
              id: '00000000-0000-4000-8000-000000000014',
              content: 'c',
              similarity: 0.7,
            }),
          ];
        },
      },
    );
    assert.equal(receivedTopK, 3);
  });

  it('D: passes optional category to memory search', async () => {
    let receivedCategory: string | undefined;
    const result = await retrieveRelevantContext({ query: 'What am I working on professionally?', category: 'professional', topK: 3,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(2, normalizeMockQuery(q)),
        searchMemories: async (_embedding, _topK, options) => {
          assert.equal(options.userId, TEST_USER_ID);
          receivedCategory = options.category;
          return [
            hit({
              id: '00000000-0000-4000-8000-000000000021',
              content: 'professional memory',
              category: 'professional',
              similarity: 0.7,
            }),
          ];
        },
      },
    );
    assert.equal(receivedCategory, 'professional');
    for (const row of result.memories) {
      assert.equal(row.category, 'professional');
    }
  });

  it('E: empty memories array is valid when nothing matches', async () => {
    const result = await retrieveRelevantContext({ query: 'unique-no-match-query-xyz', topK: 5,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(3, normalizeMockQuery(q)),
        searchMemories: async () => [],
      },
    );
    assert.equal(result.query, 'unique-no-match-query-xyz');
    assert.deepEqual(result.memories, []);
  });

  it('F: uses Phase 5.3 normalized query', async () => {
    const result = await retrieveRelevantContext({ query: '  What database do I usually prefer?  ', topK: 3,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
        searchMemories: async () => [
          hit({
            id: '00000000-0000-4000-8000-000000000031',
            content: 'User prefers PostgreSQL for backend projects.',
            similarity: 0.8,
          }),
        ],
      },
    );

    assert.equal(result.query, 'What database do I usually prefer?');
    assert.ok(!('vector' in result));
    assert.ok(!('embedding' in result));
  });

  it('G: propagates query embedding failure', async () => {
    await assert.rejects(
      () =>
        retrieveRelevantContext({ query: 'query',
        userId: TEST_USER_ID,
      },
          {
            generateQueryEmbedding: async () => {
              throw new EmbeddingOutputError('bad embedding');
            },
          },
        ),
      EmbeddingOutputError,
    );

    await assert.rejects(
      () =>
        retrieveRelevantContext({ query: 'query',
        userId: TEST_USER_ID,
      },
          {
            generateQueryEmbedding: async () => {
              throw new EmbeddingModelUnavailableError('missing model');
            },
          },
        ),
      EmbeddingModelUnavailableError,
    );
  });

  it('H: propagates memory search failure', async () => {
    await assert.rejects(
      () =>
        retrieveRelevantContext({ query: 'query',
        userId: TEST_USER_ID,
      },
          {
            generateQueryEmbedding: async (q) =>
              mockQueryEmbedding(4, normalizeMockQuery(q)),
            searchMemories: async () => {
              throw new Error('connection refused');
            },
          },
        ),
      (error: unknown) =>
        error instanceof Error && error.message === 'connection refused',
    );
  });

  it('rejects wrong query embedding dimensions', async () => {
    await assert.rejects(
      () =>
        retrieveRelevantContext({ query: 'query',
        userId: TEST_USER_ID,
      },
          {
            generateQueryEmbedding: async () => ({
              query: 'query',
              dimensions: 3,
              vector: [1, 0, 0],
            }),
            searchMemories: async () => {
              throw new Error('search should not be called');
            },
          },
        ),
      MemoryEmbeddingDimensionMismatchError,
    );
  });

  it('J: compatibility wrapper maps memories → results for public API shape', async () => {
    const wrapped = await retrieveRelevantMemories('What database do I usually prefer?',
      TEST_USER_ID,
      5,
      undefined,
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
        searchMemories: async () => [
          hit({
            id: '00000000-0000-4000-8000-000000000051',
            content: 'PostgreSQL',
            similarity: 0.8,
          }),
        ],
      },
      );

    assert.equal(wrapped.query, 'What database do I usually prefer?');
    assert.ok('results' in wrapped);
    assert.ok(!('memories' in wrapped));
    assert.equal(wrapped.results.length, 1);
    assert.ok(!('vector' in wrapped.results[0]!));
    assert.ok(!('embedding' in wrapped.results[0]!));
  });
});

describe('retrieveRelevantContext integration (requires PostgreSQL + pgvector)', () => {
  const createdIds: string[] = [];
  let dbAvailable = true;

  before(async () => {
    try {
      await db.select({ id: memories.id }).from(memories).limit(1);
    } catch (error) {
      let current: unknown = error;
      const chunks: string[] = [];
      for (let depth = 0; depth < 5 && current; depth += 1) {
        if (current instanceof Error) {
          chunks.push(current.message);
          if ('code' in current) {
            chunks.push(String((current as { code?: unknown }).code));
          }
          current = (current as { cause?: unknown }).cause;
        } else {
          chunks.push(String(current));
          break;
        }
      }
      if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(chunks.join(' '))) {
        dbAvailable = false;
        return;
      }
      throw error;
    }
  });

  after(async () => {
    if (!dbAvailable) {
      return;
    }
    for (const id of createdIds) {
      await deleteMemoryById(id, TEST_USER_ID);
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
  });

  async function seedMarked(
    content: string,
    category: (typeof MEMORY_CATEGORIES)[number],
    axis: number,
    importance = 0.6,
  ) {
    await insertMemory({ content, category, importance,
      userId: TEST_USER_ID,
    });
    const row = (await listMemories(TEST_USER_ID)).find((m) => m.content === content);
    assert.ok(row);
    createdIds.push(row!.id);
    await updateMemoryEmbedding(row!.id, unitAt(axis), TEST_USER_ID);
    return row!;
  }

  it('A/B: retrieves and ranks PostgreSQL memory by similarity', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL unavailable');
      return;
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    createdIds.length = 0;

    const near = await seedMarked(
      `${MARKER} prefers PostgreSQL for backend`,
      'professional',
      0,
      0.75,
    );
    await seedMarked(
      `${MARKER} likes hiking on weekends`,
      'personal',
      10,
      0.4,
    );

    const result = await retrieveRelevantContext({ query: 'What database do I usually prefer?', topK: 5,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
      },
    );

    assert.equal(result.query, 'What database do I usually prefer?');
    assert.ok(result.memories.length >= 1);

    const marked = result.memories.filter((r) => r.content.includes(MARKER));
    assert.ok(marked.length >= 1);
    assert.equal(marked[0]!.id, near.id);
    assert.match(marked[0]!.content, /PostgreSQL/);
    assert.equal(typeof marked[0]!.similarity, 'number');

    for (let i = 1; i < result.memories.length; i += 1) {
      assert.ok(
        result.memories[i - 1]!.similarity >= result.memories[i]!.similarity,
      );
    }
    for (const row of result.memories) {
      assert.ok(!('embedding' in row));
      assert.ok(!('vector' in row));
    }
  });

  it('C: limits memories with topK', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL unavailable');
      return;
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    createdIds.length = 0;

    await seedMarked(`${MARKER} topk a`, 'other', 0);
    await seedMarked(`${MARKER} topk b`, 'other', 1);
    await seedMarked(`${MARKER} topk c`, 'other', 2);

    const one = await retrieveRelevantContext({ query: 'topk', topK: 1,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
      },
    );
    assert.equal(one.memories.length, 1);

    const three = await retrieveRelevantContext({ query: 'topk', topK: 3,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
      },
    );
    assert.ok(three.memories.length <= 3);
  });

  it('D: filters by category before ranking', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL unavailable');
      return;
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    createdIds.length = 0;

    await seedMarked(
      `${MARKER} professional interview prep`,
      'professional',
      0,
    );
    await seedMarked(`${MARKER} personal hobby guitar`, 'personal', 0);

    const result = await retrieveRelevantContext({
        query: 'What am I working on professionally?',
        topK: 5,
        category: 'professional',
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(0, normalizeMockQuery(q)),
      },
    );

    assert.ok(result.memories.length >= 1);
    for (const row of result.memories) {
      assert.equal(row.category, 'professional');
    }
    assert.ok(
      result.memories.some((r) => r.content.includes('interview prep')),
    );
    assert.ok(
      !result.memories.some((r) => r.content.includes('hobby guitar')),
    );
  });

  it('E: empty memories when only NULL embeddings exist', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL unavailable');
      return;
    }
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    createdIds.length = 0;

    await insertMemory({
      content: `${MARKER} no vector yet`,
      category: 'other',
      importance: 0.2,
      userId: TEST_USER_ID,
    });
    const row = (await listMemories(TEST_USER_ID)).find((m) =>
      m.content.includes(`${MARKER} no vector yet`),
    );
    assert.ok(row);
    createdIds.push(row!.id);

    const result = await retrieveRelevantContext({ query: `${MARKER} unique-no-match-query-xyz`, topK: 5,
        userId: TEST_USER_ID,
      },
      {
        generateQueryEmbedding: async (q) =>
          mockQueryEmbedding(50, normalizeMockQuery(q)),
      },
    );

    const marked = result.memories.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 0);
  });
});
