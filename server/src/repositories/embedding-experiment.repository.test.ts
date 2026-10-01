/**
 * Phase 4.5/4.6 — integration tests for isolated pgvector experiment storage + search.
 * Requires a running PostgreSQL instance with the vector extension.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { embeddingExperiments } from '../db/schema/embedding-experiments.js';
import {
  createEmbeddingExperiment,
  deleteEmbeddingExperiment,
  getEmbeddingExperimentById,
  searchSimilarEmbeddings,
  EmbeddingDimensionMismatchError,
} from '../repositories/embedding-experiment.repository.js';

const MARKER = 'phase45-pgvector-test';
const SEARCH_MARKER = 'phase46-pgvector-search';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

describe('embedding experiment repository (requires PostgreSQL + pgvector)', () => {
  before(async () => {
    await db
      .select({ id: embeddingExperiments.id })
      .from(embeddingExperiments)
      .limit(1);
  });

  after(async () => {
    await db
      .delete(embeddingExperiments)
      .where(like(embeddingExperiments.text, `%${MARKER}%`));
    await db
      .delete(embeddingExperiments)
      .where(like(embeddingExperiments.text, `%${SEARCH_MARKER}%`));
  });

  it('stores and retrieves an embedding with the expected dimension', async () => {
    const fakeVector = unitAt(0);

    const created = await createEmbeddingExperiment({
      text: `${MARKER} prefers PostgreSQL`,
      embedding: fakeVector,
    });

    assert.equal(created.dimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.match(created.text, /PostgreSQL/);

    const fetched = await getEmbeddingExperimentById(created.id);
    assert.ok(fetched);
    assert.equal(fetched!.id, created.id);
    assert.equal(fetched!.dimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);

    const deleted = await deleteEmbeddingExperiment(created.id);
    assert.equal(deleted, true);
  });

  it('rejects embeddings with the wrong dimension', async () => {
    await assert.rejects(
      () =>
        createEmbeddingExperiment({
          text: `${MARKER} bad dims`,
          embedding: [1, 2, 3],
        }),
      EmbeddingDimensionMismatchError,
    );

    const leftover = await db
      .select({ id: embeddingExperiments.id })
      .from(embeddingExperiments)
      .where(eq(embeddingExperiments.text, `${MARKER} bad dims`));
    assert.equal(leftover.length, 0);
  });

  it('ranks nearest vectors first via pgvector cosine distance', async () => {
    const near = await createEmbeddingExperiment({
      text: `${SEARCH_MARKER} near`,
      embedding: unitAt(0),
    });
    const mid = await createEmbeddingExperiment({
      text: `${SEARCH_MARKER} mid`,
      embedding: unitAt(1),
    });
    await createEmbeddingExperiment({
      text: `${SEARCH_MARKER} far`,
      embedding: unitAt(2),
    });

    const query = unitAt(0);
    query[0] = 0.9;
    query[1] = Math.sqrt(1 - 0.9 ** 2);

    const results = await searchSimilarEmbeddings(query, 2);
    const marked = results.filter((r) => r.text.includes(SEARCH_MARKER));

    assert.equal(marked.length, 2);
    assert.equal(marked[0]!.id, near.id);
    assert.equal(marked[1]!.id, mid.id);
    assert.ok(marked[0]!.similarity >= marked[1]!.similarity);
  });

  it('respects topK', async () => {
    await db
      .delete(embeddingExperiments)
      .where(like(embeddingExperiments.text, `%${SEARCH_MARKER}%`));

    const a = await createEmbeddingExperiment({
      text: `${SEARCH_MARKER} only-a`,
      embedding: unitAt(5),
    });
    await createEmbeddingExperiment({
      text: `${SEARCH_MARKER} only-b`,
      embedding: unitAt(6),
    });

    const top1 = await searchSimilarEmbeddings(unitAt(5), 1);
    assert.equal(top1.length, 1);
    assert.equal(top1[0]!.id, a.id);
  });

  it('rejects search with wrong query dimension', async () => {
    await assert.rejects(
      () => searchSimilarEmbeddings([1, 2, 3], 3),
      EmbeddingDimensionMismatchError,
    );
  });
});
