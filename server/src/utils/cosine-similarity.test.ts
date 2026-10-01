import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CosineSimilarityError,
  cosineSimilarity,
} from './cosine-similarity.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
  });

  it('returns -1 for opposite vectors', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [-1, 0, 0]), -1);
  });

  it('throws when dimensions differ', () => {
    assert.throws(
      () => cosineSimilarity([1, 0], [1, 0, 0]),
      (error: unknown) =>
        error instanceof CosineSimilarityError &&
        /same dimensions/i.test(error.message),
    );
  });

  it('throws for empty vectors', () => {
    assert.throws(
      () => cosineSimilarity([], [1]),
      (error: unknown) =>
        error instanceof CosineSimilarityError &&
        /non-empty/i.test(error.message),
    );
    assert.throws(
      () => cosineSimilarity([1], []),
      CosineSimilarityError,
    );
  });

  it('throws for zero-magnitude vectors', () => {
    assert.throws(
      () => cosineSimilarity([0, 0, 0], [1, 0, 0]),
      (error: unknown) =>
        error instanceof CosineSimilarityError &&
        /zero-magnitude/i.test(error.message),
    );
    assert.throws(
      () => cosineSimilarity([1, 0, 0], [0, 0, 0]),
      CosineSimilarityError,
    );
  });
});
