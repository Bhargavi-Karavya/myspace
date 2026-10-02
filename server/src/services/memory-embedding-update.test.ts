/**
 * Phase 4.13 — embedding sync on memory content updates.
 * Uses mocked embedding generation so tests do not require Gemini.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  getMemoryEmbeddingDimensions,
  getMemoryEmbeddingFingerprint,
  insertMemory,
  listMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';
import { memoryIdParamSchema } from '../validators/ai.validator.js';
import {
  editMemory,
  MemoryNotFoundError,
} from './memory.service.js';
import type { MemoryContentEmbedding } from './memory-embedding.service.js';

const MARKER = 'phase413-embedding-update';

const TEST_USER_ID = 'test-user-phase49';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

function mockEmbedding(axis: number): MemoryContentEmbedding {
  return {
    dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
    vector: unitAt(axis),
  };
}

describe('memoryIdParamSchema (Phase 4.13)', () => {
  it('rejects an invalid UUID (→ 400)', () => {
    assert.equal(
      memoryIdParamSchema.safeParse({ id: 'not-a-uuid' }).success,
      false,
    );
  });
});

describe('editMemory embedding sync (requires PostgreSQL + pgvector)', () => {
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

  async function insertMarked(
    content: string,
    category: 'preference' | 'professional' | 'personal' | 'goal' | 'other',
    importance: number,
  ) {
    await insertMemory({ content, category, importance,
      userId: TEST_USER_ID,
    });
    const row = (await listMemories(TEST_USER_ID)).find((m) => m.content === content);
    assert.ok(row);
    createdIds.push(row!.id);
    return row!;
  }

  it('A: content update regenerates embedding when one already exists', async () => {
    const row = await insertMarked(
      `${MARKER} prefer postgres`,
      'preference',
      0.7,
    );
    await updateMemoryEmbedding(row.id, unitAt(0), TEST_USER_ID);
    const beforeFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);
    assert.ok(beforeFp);

    let generateCalls = 0;
    const patched = await editMemory(row.id, {
        content: `${MARKER} prefer redis and postgres`,
      }, TEST_USER_ID, {
        generateEmbeddingForContent: async (content) => {
          generateCalls += 1;
          assert.match(content, /redis and postgres/);
          return mockEmbedding(3);
        },
      });

    assert.equal(generateCalls, 1);
    assert.equal(patched.content, `${MARKER} prefer redis and postgres`);
    assert.equal(patched.hasEmbedding, true);
    assert.equal(patched.embeddingDimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.ok(!('embedding' in patched));
    assert.ok(!('vector' in patched));

    const afterFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);
    assert.ok(afterFp);
    assert.notEqual(afterFp, beforeFp);
    assert.equal(
      await getMemoryEmbeddingDimensions(row.id, TEST_USER_ID),
      EMBEDDING_EXPERIMENT_DIMENSIONS,
    );
  });

  it('B: content update with NULL embedding generates one', async () => {
    const row = await insertMarked(
      `${MARKER} null emb start`,
      'other',
      0.4,
    );
    assert.equal(row.hasEmbedding, false);
    assert.equal(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID), null);

    const patched = await editMemory(row.id, { content: `${MARKER} null emb after` }, TEST_USER_ID, {
        generateEmbeddingForContent: async () => mockEmbedding(4),
      });

    assert.equal(patched.content, `${MARKER} null emb after`);
    assert.equal(patched.hasEmbedding, true);
    assert.equal(patched.embeddingDimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.ok(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID));
  });

  it('C: category-only update does not regenerate embedding', async () => {
    const row = await insertMarked(
      `${MARKER} category only`,
      'preference',
      0.5,
    );
    await updateMemoryEmbedding(row.id, unitAt(1), TEST_USER_ID);
    const beforeFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);

    let generateCalls = 0;
    const patched = await editMemory(row.id, { category: 'professional' }, TEST_USER_ID, {
        generateEmbeddingForContent: async () => {
          generateCalls += 1;
          return mockEmbedding(9);
        },
      });

    assert.equal(generateCalls, 0);
    assert.equal(patched.category, 'professional');
    assert.equal(patched.content, `${MARKER} category only`);
    assert.equal(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID), beforeFp);
  });

  it('D: importance-only update does not regenerate embedding', async () => {
    const row = await insertMarked(
      `${MARKER} importance only`,
      'goal',
      0.3,
    );
    await updateMemoryEmbedding(row.id, unitAt(2), TEST_USER_ID);
    const beforeFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);

    let generateCalls = 0;
    const patched = await editMemory(row.id, { importance: 0.95 }, TEST_USER_ID, {
        generateEmbeddingForContent: async () => {
          generateCalls += 1;
          return mockEmbedding(8);
        },
      });

    assert.equal(generateCalls, 0);
    assert.equal(patched.importance, 0.95);
    assert.equal(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID), beforeFp);
  });

  it('E: identical content does not regenerate embedding', async () => {
    const content = `${MARKER} identical content`;
    const row = await insertMarked(content, 'personal', 0.6);
    await updateMemoryEmbedding(row.id, unitAt(5), TEST_USER_ID);
    const beforeFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);

    let generateCalls = 0;
    const patched = await editMemory(row.id, { content, importance: 0.61 }, TEST_USER_ID, {
        generateEmbeddingForContent: async () => {
          generateCalls += 1;
          return mockEmbedding(7);
        },
      });

    assert.equal(generateCalls, 0);
    assert.equal(patched.content, content);
    assert.equal(patched.importance, 0.61);
    assert.equal(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID), beforeFp);
  });

  it('F: embedding failure leaves content and embedding unchanged', async () => {
    const content = `${MARKER} fail keep old`;
    const row = await insertMarked(content, 'preference', 0.55);
    await updateMemoryEmbedding(row.id, unitAt(6), TEST_USER_ID);
    const beforeFp = await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID);

    await assert.rejects(
      () =>
        editMemory(row.id, { content: `${MARKER} fail new content` }, TEST_USER_ID, {
            generateEmbeddingForContent: async () => {
              throw new Error('simulated Gemini embedding failure');
            },
          }),
      /simulated Gemini embedding failure/,
    );

    const listed = await listMemories(TEST_USER_ID);
    const after = listed.find((m) => m.id === row.id);
    assert.ok(after);
    assert.equal(after!.content, content);
    assert.equal(await getMemoryEmbeddingFingerprint(row.id, TEST_USER_ID), beforeFp);
  });

  it('H: missing memory → MemoryNotFoundError (→ 404)', async () => {
    await assert.rejects(
      () =>
        editMemory('00000000-0000-4000-8000-000000000099', {
          content: 'nope',
        }, TEST_USER_ID),
      MemoryNotFoundError,
    );
  });
});
