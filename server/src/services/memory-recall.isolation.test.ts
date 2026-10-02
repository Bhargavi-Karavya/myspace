/**
 * Memory recall isolation: User A name memory is retrieved for A, never for B.
 * Mocks Gemini embedding; uses real pgvector search.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  insertMemory,
  searchSimilarMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';
import { buildUserRagContextForChat } from './chat-rag.service.js';
import { filterByRelevanceThreshold } from './rag-threshold.service.js';
import { rankRelevantContext } from './rag-ranking.service.js';
import { retrieveRelevantContext } from './rag-retrieval.service.js';

const USER_A = 'recall-user-a';
const USER_B = 'recall-user-b';
const MARKER = 'memory-recall-e2e';

function nameVector(): number[] {
  // Distinct unit direction for the name memory.
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === 42 ? 1 : 0,
  );
}

function unrelatedVector(): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === 99 ? 1 : 0,
  );
}

describe('memory recall across conversations (user-scoped)', () => {
  const createdIds: string[] = [];

  before(async () => {
    await db.select({ id: memories.id }).from(memories).limit(1);
  });

  after(async () => {
    for (const id of createdIds) {
      await db.delete(memories).where(eq(memories.id, id));
    }
  });

  it('Conversation 1 stores name memory for User A with embedding', async () => {
    const saved = await insertMemory({
      userId: USER_A,
      content: `${MARKER} User's name is Bhargavi`,
      category: 'personal',
      importance: 0.95,
    });
    createdIds.push(saved.id);

    const updated = await updateMemoryEmbedding(
      saved.id,
      nameVector(),
      USER_A,
    );
    assert.ok(updated?.hasEmbedding);

    const hits = await searchSimilarMemories(nameVector(), 5, {
      userId: USER_A,
    });
    assert.ok(hits.some((hit) => hit.id === saved.id));
  });

  it('Conversation 2: User A asking name retrieves their memory', async () => {
    const retrieved = await retrieveRelevantContext(
      { query: 'What is my name?', userId: USER_A },
      {
        generateQueryEmbedding: async () => ({
          query: 'What is my name?',
          vector: nameVector(),
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );

    const ranked = rankRelevantContext(retrieved.memories);
    const filtered = filterByRelevanceThreshold(ranked, 0.5);
    assert.ok(
      filtered.some((m) => m.content.includes('Bhargavi')),
      'User A recall should include Bhargavi memory',
    );

    const context = await buildUserRagContextForChat(
      { query: 'What is my name?', userId: USER_A },
      {
        generateQueryEmbedding: async () => ({
          query: 'What is my name?',
          vector: nameVector(),
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );
    assert.ok(context.memories.some((m) => m.content.includes('Bhargavi')));
  });

  it('User B asking name does not retrieve User A memory', async () => {
    // Give User B an unrelated embedded memory so search is non-empty for them.
    const other = await insertMemory({
      userId: USER_B,
      content: `${MARKER} User B likes hiking`,
      category: 'preference',
      importance: 0.7,
    });
    createdIds.push(other.id);
    await updateMemoryEmbedding(other.id, unrelatedVector(), USER_B);

    const retrieved = await retrieveRelevantContext(
      { query: 'What is my name?', userId: USER_B },
      {
        generateQueryEmbedding: async () => ({
          query: 'What is my name?',
          vector: nameVector(),
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );

    assert.equal(
      retrieved.memories.some((m) => m.content.includes('Bhargavi')),
      false,
      'User B must not retrieve User A name memory',
    );
    assert.equal(
      retrieved.memories.some((m) => m.content.includes(MARKER) && m.content.includes('Bhargavi')),
      false,
    );

    const context = await buildUserRagContextForChat(
      { query: 'What is my name?', userId: USER_B },
      {
        generateQueryEmbedding: async () => ({
          query: 'What is my name?',
          vector: nameVector(),
          dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
        }),
      },
    );
    assert.equal(
      context.memories.some((m) => m.content.includes('Bhargavi')),
      false,
    );
  });
});
