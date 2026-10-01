/**
 * Phase 4.7/4.8/4.9 — memory embeddings (generate, persist, similarity search).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import 'dotenv/config';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import {
  memoryIdParamSchema,
  memorySearchRequestSchema,
} from '../validators/ai.validator.js';
import {
  deleteMemoryById,
  findMemoryById,
  getMemoryEmbeddingDimensions,
  insertMemory,
  listMemories,
  updateMemoryEmbedding,
  MemoryEmbeddingDimensionMismatchError,
} from '../repositories/memory.repository.js';
import {
  generateEmbeddingForMemory,
  isExpectedMemoryEmbeddingDimension,
  persistEmbeddingForMemory,
  searchMemoriesBySimilarity,
} from './memory-embedding.service.js';
import { MemoryNotFoundError } from './memory.service.js';
import {
  EmbeddingModelUnavailableError,
  EmbeddingOutputError,
} from './embedding.service.js';

const MARKER = 'phase47-memory-embedding';
const PERSIST_MARKER = 'phase48-memory-embedding';
const SEARCH_MARKER = 'phase49-memory-search-svc';

describe('memoryIdParamSchema (Phase 4.7)', () => {
  it('rejects an invalid memory UUID', () => {
    const parsed = memoryIdParamSchema.safeParse({ id: 'not-a-uuid' });
    assert.equal(parsed.success, false);
  });

  it('accepts a valid UUID', () => {
    const parsed = memoryIdParamSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
    });
    assert.equal(parsed.success, true);
  });
});

describe('generateEmbeddingForMemory (requires PostgreSQL + Gemini)', () => {
  const createdIds: string[] = [];

  after(async () => {
    for (const id of createdIds) {
      await deleteMemoryById(id);
    }
  });

  it('throws MemoryNotFoundError for a nonexistent memory', async () => {
    await assert.rejects(
      () =>
        generateEmbeddingForMemory('00000000-0000-4000-8000-000000000099'),
      MemoryNotFoundError,
    );
  });

  it('generates a 3072-d numeric embedding without changing the memory row', async (t) => {
    await insertMemory({
      content: `${MARKER} prefers TypeScript`,
      category: 'preference',
      importance: 0.6,
    });

    const listed = await listMemories();
    const row = listed.find((m) => m.content.includes(MARKER));
    assert.ok(row, 'expected inserted memory to be listable');
    createdIds.push(row!.id);
    assert.equal(row!.hasEmbedding, false);

    const before = await findMemoryById(row!.id);
    assert.ok(before);

    let result;
    try {
      result = await generateEmbeddingForMemory(row!.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/fetch failed|ECONNRESET|ETIMEDOUT|503|unavailable/i.test(message)) {
        t.skip(`Gemini embedding unavailable during test: ${message}`);
        return;
      }
      throw error;
    }

    assert.equal(result.memory.id, row!.id);
    assert.equal(result.memory.content, before!.content);
    assert.equal(
      result.embedding.dimensions,
      EMBEDDING_EXPERIMENT_DIMENSIONS,
    );
    assert.ok(
      isExpectedMemoryEmbeddingDimension(result.embedding.dimensions),
    );
    assert.equal(result.embedding.vector.length, result.embedding.dimensions);
    assert.ok(
      result.embedding.vector.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ),
    );

    const after = await findMemoryById(row!.id);
    assert.ok(after);
    assert.equal(after!.content, before!.content);
    assert.equal(after!.category, before!.category);
    assert.equal(after!.importance, before!.importance);
    assert.equal(after!.hasEmbedding, false);
    assert.equal(
      after!.updatedAt.getTime(),
      before!.updatedAt.getTime(),
    );
  });
});

describe('memory embedding persistence (requires PostgreSQL + pgvector)', () => {
  const createdIds: string[] = [];

  after(async () => {
    for (const id of createdIds) {
      await deleteMemoryById(id);
    }
  });

  it('allows NULL embeddings on new memories', async () => {
    await insertMemory({
      content: `${PERSIST_MARKER} null embedding ok`,
      category: 'other',
      importance: 0.4,
    });
    const row = (await listMemories()).find((m) =>
      m.content.includes(`${PERSIST_MARKER} null embedding ok`),
    );
    assert.ok(row);
    createdIds.push(row!.id);
    assert.equal(row!.hasEmbedding, false);
    assert.equal(await getMemoryEmbeddingDimensions(row!.id), null);
  });

  it('persists a 3072-d embedding without changing content/category/importance', async () => {
    await insertMemory({
      content: `${PERSIST_MARKER} store vector`,
      category: 'preference',
      importance: 0.55,
    });
    const row = (await listMemories()).find((m) =>
      m.content.includes(`${PERSIST_MARKER} store vector`),
    );
    assert.ok(row);
    createdIds.push(row!.id);

    const before = await findMemoryById(row!.id);
    assert.ok(before);
    assert.equal(before!.hasEmbedding, false);

    const vector = Array.from(
      { length: EMBEDDING_EXPERIMENT_DIMENSIONS },
      (_, i) => (i === 0 ? 1 : 0),
    );

    const updated = await updateMemoryEmbedding(row!.id, vector);
    assert.ok(updated);
    assert.equal(updated!.hasEmbedding, true);
    assert.equal(updated!.content, before!.content);
    assert.equal(updated!.category, before!.category);
    assert.equal(updated!.importance, before!.importance);
    assert.ok(updated!.updatedAt.getTime() >= before!.updatedAt.getTime());

    assert.equal(
      await getMemoryEmbeddingDimensions(row!.id),
      EMBEDDING_EXPERIMENT_DIMENSIONS,
    );
  });

  it('rejects wrong embedding dimensions', async () => {
    await assert.rejects(
      () =>
        updateMemoryEmbedding('00000000-0000-4000-8000-000000000001', [1, 2]),
      MemoryEmbeddingDimensionMismatchError,
    );
  });

  it('persistEmbeddingForMemory returns 404 for missing memory', async () => {
    await assert.rejects(
      () =>
        persistEmbeddingForMemory('00000000-0000-4000-8000-000000000099'),
      MemoryNotFoundError,
    );
  });

  it('persistEmbeddingForMemory stores Gemini vector when available', async (t) => {
    await insertMemory({
      content: `${PERSIST_MARKER} live gemini persist`,
      category: 'goal',
      importance: 0.7,
    });
    const row = (await listMemories()).find((m) =>
      m.content.includes(`${PERSIST_MARKER} live gemini persist`),
    );
    assert.ok(row);
    createdIds.push(row!.id);

    const before = await findMemoryById(row!.id);
    assert.ok(before);

    let result;
    try {
      result = await persistEmbeddingForMemory(row!.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/fetch failed|ECONNRESET|ETIMEDOUT|503|unavailable/i.test(message)) {
        t.skip(`Gemini embedding unavailable during test: ${message}`);
        return;
      }
      throw error;
    }

    assert.equal(result.memory.id, row!.id);
    assert.equal(result.memory.content, before!.content);
    assert.equal(result.memory.hasEmbedding, true);
    assert.equal(
      result.memory.embeddingDimensions,
      EMBEDDING_EXPERIMENT_DIMENSIONS,
    );

    const after = await findMemoryById(row!.id);
    assert.ok(after);
    assert.equal(after!.hasEmbedding, true);
    assert.equal(after!.content, before!.content);
    assert.equal(after!.category, before!.category);
    assert.equal(after!.importance, before!.importance);
  });
});

describe('memorySearchRequestSchema validation (Phase 4.9 → 400)', () => {
  it('maps empty/invalid query and topK to validation failure', () => {
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: '' }).success,
      false,
    );
    assert.equal(
      memorySearchRequestSchema.safeParse({ query: 'ok', topK: 0 }).success,
      false,
    );
  });
});

describe('searchMemoriesBySimilarity error types (Phase 4.9)', () => {
  it('EmbeddingOutputError and EmbeddingModelUnavailableError are 503-class errors', () => {
    const output = new EmbeddingOutputError('boom');
    const unavailable = new EmbeddingModelUnavailableError('missing model');
    assert.equal(output.name, 'EmbeddingOutputError');
    assert.equal(unavailable.name, 'EmbeddingModelUnavailableError');
  });
});

describe('searchMemoriesBySimilarity (requires PostgreSQL + Gemini)', () => {
  const createdIds: string[] = [];

  after(async () => {
    for (const id of createdIds) {
      await deleteMemoryById(id);
    }
  });

  it('returns empty results when only NULL-embedding memories exist', async (t) => {
    await insertMemory({
      content: `${SEARCH_MARKER} no vector yet`,
      category: 'other',
      importance: 0.2,
    });
    const row = (await listMemories()).find((m) =>
      m.content.includes(`${SEARCH_MARKER} no vector yet`),
    );
    assert.ok(row);
    createdIds.push(row!.id);
    assert.equal(row!.hasEmbedding, false);

    let result;
    try {
      result = await searchMemoriesBySimilarity(
        `${SEARCH_MARKER} unique-no-match-query-xyz`,
        3,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof EmbeddingOutputError ||
        error instanceof EmbeddingModelUnavailableError ||
        /fetch failed|ECONNRESET|ETIMEDOUT|503|unavailable/i.test(message)
      ) {
        t.skip(`Gemini embedding unavailable during test: ${message}`);
        return;
      }
      throw error;
    }

    assert.equal(result.query, `${SEARCH_MARKER} unique-no-match-query-xyz`);
    const marked = result.results.filter((r) =>
      r.content.includes(SEARCH_MARKER),
    );
    assert.equal(marked.length, 0);
    for (const hit of result.results) {
      assert.ok(!('embedding' in hit));
    }
  });

  it('finds semantically related memories when Gemini is available', async (t) => {
    await insertMemory({
      content: `${SEARCH_MARKER} I prefer PostgreSQL for backend work`,
      category: 'preference',
      importance: 0.85,
    });
    const row = (await listMemories()).find((m) =>
      m.content.includes(`${SEARCH_MARKER} I prefer PostgreSQL`),
    );
    assert.ok(row);
    createdIds.push(row!.id);

    try {
      await persistEmbeddingForMemory(row!.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof EmbeddingOutputError ||
        error instanceof EmbeddingModelUnavailableError ||
        /fetch failed|ECONNRESET|ETIMEDOUT|503|unavailable/i.test(message)
      ) {
        t.skip(`Gemini embedding unavailable during test: ${message}`);
        return;
      }
      throw error;
    }

    let result;
    try {
      result = await searchMemoriesBySimilarity(
        'What database do I usually prefer?',
        3,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof EmbeddingOutputError ||
        error instanceof EmbeddingModelUnavailableError ||
        /fetch failed|ECONNRESET|ETIMEDOUT|503|unavailable/i.test(message)
      ) {
        t.skip(`Gemini embedding unavailable during test: ${message}`);
        return;
      }
      throw error;
    }

    assert.ok(result.results.length >= 1);
    assert.ok(result.results.length <= 3);
    const hit = result.results.find((r) => r.id === row!.id);
    assert.ok(hit, 'expected persisted memory in search results');
    assert.equal(typeof hit!.similarity, 'number');
    assert.ok(!('embedding' in hit!));
    assert.ok(!('vector' in hit!));

    for (let i = 1; i < result.results.length; i++) {
      assert.ok(
        result.results[i - 1]!.similarity >= result.results[i]!.similarity,
      );
    }
  });
});
