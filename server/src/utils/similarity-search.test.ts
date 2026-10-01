import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SimilaritySearchError,
  searchSimilarVectors,
  type SimilaritySearchCandidate,
} from './similarity-search.js';

function candidate(
  id: string,
  text: string,
  vector: number[],
): SimilaritySearchCandidate {
  return { id, text, vector };
}

describe('searchSimilarVectors', () => {
  it('sorts candidates by similarity descending', () => {
    // Query [1,0] → A≈0.4-ish direction, B aligned, C middling via angles
    // Use unit-ish vectors with known cosine to [1, 0]:
    // B [1,0] → 1.0, C [0.7,0.7] → ~0.707, A [0.4, 0.9165] → ~0.4
    const query = [1, 0];
    const results = searchSimilarVectors(query, [
      candidate('A', 'low', [0.4, Math.sqrt(1 - 0.4 ** 2)]),
      candidate('B', 'high', [1, 0]),
      candidate('C', 'mid', [Math.SQRT1_2, Math.SQRT1_2]),
    ]);

    assert.deepEqual(
      results.map((r) => r.id),
      ['B', 'C', 'A'],
    );
    assert.ok(results[0]!.similarity > results[1]!.similarity);
    assert.ok(results[1]!.similarity > results[2]!.similarity);
  });

  it('respects topK = 2', () => {
    const query = [1, 0];
    const results = searchSimilarVectors(
      query,
      [
        candidate('A', 'low', [0.4, Math.sqrt(1 - 0.4 ** 2)]),
        candidate('B', 'high', [1, 0]),
        candidate('C', 'mid', [Math.SQRT1_2, Math.SQRT1_2]),
      ],
      2,
    );

    assert.equal(results.length, 2);
    assert.deepEqual(
      results.map((r) => r.id),
      ['B', 'C'],
    );
  });

  it('returns all candidates when topK exceeds count', () => {
    const query = [1, 0];
    const results = searchSimilarVectors(
      query,
      [candidate('B', 'high', [1, 0]), candidate('A', 'low', [0, 1])],
      10,
    );

    assert.equal(results.length, 2);
    assert.equal(results[0]!.id, 'B');
    assert.equal(results[1]!.id, 'A');
  });

  it('returns all ranked candidates when topK is omitted', () => {
    const query = [1, 0];
    const results = searchSimilarVectors(query, [
      candidate('A', 'ortho', [0, 1]),
      candidate('B', 'same', [1, 0]),
    ]);

    assert.equal(results.length, 2);
    assert.equal(results[0]!.id, 'B');
    assert.equal(results[1]!.id, 'A');
  });

  it('returns an empty list for empty candidates', () => {
    assert.deepEqual(searchSimilarVectors([1, 0], []), []);
  });

  it('throws on dimension mismatch', () => {
    assert.throws(
      () =>
        searchSimilarVectors([1, 0], [
          candidate('x', 'bad', [1, 0, 0]),
        ]),
      SimilaritySearchError,
    );
  });

  it('breaks similarity ties by original candidate order', () => {
    const query = [1, 0];
    // Both identical to query → similarity 1; first listed stays first.
    const results = searchSimilarVectors(query, [
      candidate('first', 'a', [1, 0]),
      candidate('second', 'b', [1, 0]),
      candidate('third', 'c', [1, 0]),
    ]);

    assert.deepEqual(
      results.map((r) => r.id),
      ['first', 'second', 'third'],
    );
  });

  it('rejects invalid topK', () => {
    assert.throws(
      () =>
        searchSimilarVectors([1, 0], [candidate('a', 't', [1, 0])], 0),
      SimilaritySearchError,
    );
  });
});
