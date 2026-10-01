/**
 * Phase 5.3 — query embedding service tests.
 * Unit tests mock Gemini; optional live test skips when unavailable.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'dotenv/config';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { ragQuerySchema } from '../validators/ai.validator.js';
import {
  EmbeddingModelUnavailableError,
  EmbeddingOutputError,
  type EmbeddingTestResult,
} from './embedding.service.js';
import {
  generateQueryEmbedding,
  normalizeQueryForEmbedding,
  QueryEmbeddingInputError,
  toQueryEmbeddingMetadata,
} from './query-embedding.service.js';

function mockEmbedding(
  text: string,
  dims = EMBEDDING_EXPERIMENT_DIMENSIONS,
): EmbeddingTestResult {
  return {
    embeddings: [
      {
        text,
        dimensions: dims,
        embedding: Array.from({ length: dims }, (_, i) => (i === 0 ? 1 : 0)),
      },
    ],
  };
}

describe('ragQuerySchema / normalizeQueryForEmbedding (Phase 5.3)', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(
      normalizeQueryForEmbedding(' What database do I prefer? '),
      'What database do I prefer?',
    );
    assert.equal(
      ragQuerySchema.parse('   What database do I usually prefer?   '),
      'What database do I usually prefer?',
    );
  });

  it('rejects an empty query', () => {
    assert.throws(
      () => normalizeQueryForEmbedding(''),
      QueryEmbeddingInputError,
    );
    assert.equal(ragQuerySchema.safeParse('').success, false);
  });

  it('rejects a whitespace-only query', () => {
    assert.throws(
      () => normalizeQueryForEmbedding('   '),
      QueryEmbeddingInputError,
    );
    assert.equal(ragQuerySchema.safeParse('   ').success, false);
  });

  it('rejects a non-string query', () => {
    assert.throws(
      () => normalizeQueryForEmbedding(123),
      QueryEmbeddingInputError,
    );
    assert.throws(
      () => normalizeQueryForEmbedding(null),
      QueryEmbeddingInputError,
    );
    assert.throws(
      () => normalizeQueryForEmbedding({}),
      QueryEmbeddingInputError,
    );
    assert.equal(ragQuerySchema.safeParse(123).success, false);
    assert.equal(ragQuerySchema.safeParse(null).success, false);
  });
});

describe('generateQueryEmbedding (Phase 5.3)', () => {
  it('trims the query and calls the embedding service with the normalized text', async () => {
    let received: string[] | undefined;
    const result = await generateQueryEmbedding(
      ' What database do I prefer? ',
      {
        generateTextEmbeddings: async (texts) => {
          received = texts;
          return mockEmbedding(texts[0]!);
        },
      },
    );

    assert.deepEqual(received, ['What database do I prefer?']);
    assert.equal(result.query, 'What database do I prefer?');
    assert.equal(result.dimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.equal(result.vector.length, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.ok(result.vector.every((n) => typeof n === 'number'));
  });

  it('rejects empty and whitespace-only queries before embedding', async () => {
    let called = false;
    const deps = {
      generateTextEmbeddings: async () => {
        called = true;
        return mockEmbedding('x');
      },
    };

    await assert.rejects(
      () => generateQueryEmbedding('', deps),
      QueryEmbeddingInputError,
    );
    await assert.rejects(
      () => generateQueryEmbedding('   ', deps),
      QueryEmbeddingInputError,
    );
    await assert.rejects(
      () => generateQueryEmbedding(123, deps),
      QueryEmbeddingInputError,
    );
    assert.equal(called, false);
  });

  it('propagates embedding service failures without wrapping into input errors', async () => {
    await assert.rejects(
      () =>
        generateQueryEmbedding('What database do I prefer?', {
          generateTextEmbeddings: async () => {
            throw new EmbeddingOutputError('bad embedding');
          },
        }),
      EmbeddingOutputError,
    );

    await assert.rejects(
      () =>
        generateQueryEmbedding('What database do I prefer?', {
          generateTextEmbeddings: async () => {
            throw new EmbeddingModelUnavailableError('missing model');
          },
        }),
      EmbeddingModelUnavailableError,
    );
  });

  it('toQueryEmbeddingMetadata never includes vector or embedding fields', async () => {
    const result = await generateQueryEmbedding('What database do I prefer?', {
      generateTextEmbeddings: async (texts) => mockEmbedding(texts[0]!),
    });
    const meta = toQueryEmbeddingMetadata(result);
    assert.deepEqual(meta, {
      query: 'What database do I prefer?',
      dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
    });
    assert.ok(!('vector' in meta));
    assert.ok(!('embedding' in meta));
  });

  it('uses the live Gemini embedding service when available', async (t) => {
    let result;
    try {
      result = await generateQueryEmbedding(' What database do I prefer? ');
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

    assert.equal(result.query, 'What database do I prefer?');
    assert.equal(result.dimensions, EMBEDDING_EXPERIMENT_DIMENSIONS);
    assert.equal(result.vector.length, EMBEDDING_EXPERIMENT_DIMENSIONS);
  });
});
