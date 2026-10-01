/**
 * Phase 5.7 — RAG relevance threshold service tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RankedContextMemory } from './rag-ranking.service.js';
import {
  DEFAULT_RELEVANCE_THRESHOLD,
  RelevanceThresholdError,
  filterByRelevanceThreshold,
} from './rag-threshold.service.js';

function ranked(
  partial: Partial<RankedContextMemory> &
    Pick<RankedContextMemory, 'id' | 'content' | 'rankingScore'>,
): RankedContextMemory {
  return {
    category: 'professional',
    importance: 0.5,
    similarity: 0.5,
    ...partial,
  };
}

describe('filterByRelevanceThreshold (Phase 5.7)', () => {
  it('A: uses DEFAULT_RELEVANCE_THRESHOLD (0.6) when omitted', () => {
    assert.equal(DEFAULT_RELEVANCE_THRESHOLD, 0.6);

    const filtered = filterByRelevanceThreshold([
      ranked({ id: 'keep', content: 'above', rankingScore: 0.61 }),
      ranked({ id: 'drop', content: 'below', rankingScore: 0.59 }),
    ]);

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['keep'],
    );
  });

  it('B: keeps memories above the threshold', () => {
    const filtered = filterByRelevanceThreshold(
      [ranked({ id: '1', content: 'I prefer PostgreSQL.', rankingScore: 0.8 })],
      0.6,
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.id, '1');
  });

  it('C: removes memories below the threshold', () => {
    const filtered = filterByRelevanceThreshold(
      [ranked({ id: '1', content: 'weak', rankingScore: 0.4 })],
      0.6,
    );

    assert.deepEqual(filtered, []);
  });

  it('D: keeps memories exactly equal to the threshold', () => {
    const filtered = filterByRelevanceThreshold(
      [ranked({ id: 'exact', content: 'boundary', rankingScore: 0.6 })],
      0.6,
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.id, 'exact');
    assert.equal(filtered[0]!.rankingScore, 0.6);
  });

  it('E: keeps only memories meeting the threshold among many', () => {
    const filtered = filterByRelevanceThreshold(
      [
        ranked({ id: 'a', content: 'a', rankingScore: 0.9 }),
        ranked({ id: 'b', content: 'b', rankingScore: 0.72 }),
        ranked({ id: 'c', content: 'c', rankingScore: 0.61 }),
        ranked({ id: 'd', content: 'd', rankingScore: 0.4 }),
      ],
      0.6,
    );

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['a', 'b', 'c'],
    );
  });

  it('F: preserves ranked order without re-sorting', () => {
    const filtered = filterByRelevanceThreshold(
      [
        ranked({ id: 'first', content: '0.90', rankingScore: 0.9 }),
        ranked({ id: 'second', content: '0.72', rankingScore: 0.72 }),
        ranked({ id: 'third', content: '0.61', rankingScore: 0.61 }),
        ranked({ id: 'fourth', content: '0.40', rankingScore: 0.4 }),
      ],
      0.6,
    );

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['first', 'second', 'third'],
    );
  });

  it('G: empty input returns []', () => {
    assert.deepEqual(filterByRelevanceThreshold([]), []);
    assert.deepEqual(filterByRelevanceThreshold([], 0.8), []);
  });

  it('H: custom threshold filters correctly', () => {
    const filtered = filterByRelevanceThreshold(
      [
        ranked({ id: 'a', content: 'a', rankingScore: 0.9 }),
        ranked({ id: 'b', content: 'b', rankingScore: 0.8 }),
        ranked({ id: 'c', content: 'c', rankingScore: 0.79 }),
      ],
      0.8,
    );

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['a', 'b'],
    );
  });

  it('I: threshold 0 keeps all non-negative rankingScores', () => {
    const filtered = filterByRelevanceThreshold(
      [
        ranked({ id: 'a', content: 'a', rankingScore: 0 }),
        ranked({ id: 'b', content: 'b', rankingScore: 0.01 }),
        ranked({ id: 'c', content: 'c', rankingScore: 1 }),
      ],
      0,
    );

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['a', 'b', 'c'],
    );
  });

  it('J: threshold 1 keeps only rankingScore exactly 1', () => {
    const filtered = filterByRelevanceThreshold(
      [
        ranked({ id: 'almost', content: 'almost', rankingScore: 0.999 }),
        ranked({ id: 'exact', content: 'exact', rankingScore: 1 }),
      ],
      1,
    );

    assert.deepEqual(
      filtered.map((m) => m.id),
      ['exact'],
    );
  });

  it('K: rejects a negative threshold', () => {
    assert.throws(
      () => filterByRelevanceThreshold([], -0.1),
      RelevanceThresholdError,
    );
  });

  it('L: rejects a threshold greater than 1', () => {
    assert.throws(
      () => filterByRelevanceThreshold([], 1.1),
      RelevanceThresholdError,
    );
  });

  it('M: rejects NaN', () => {
    assert.throws(
      () => filterByRelevanceThreshold([], Number.NaN),
      RelevanceThresholdError,
    );
  });

  it('N: rejects Infinity', () => {
    assert.throws(
      () => filterByRelevanceThreshold([], Number.POSITIVE_INFINITY),
      RelevanceThresholdError,
    );
    assert.throws(
      () => filterByRelevanceThreshold([], Number.NEGATIVE_INFINITY),
      RelevanceThresholdError,
    );
  });

  it('O: does not mutate the input array or memory objects', () => {
    const input = [
      ranked({ id: 'keep', content: 'keep', rankingScore: 0.8 }),
      ranked({ id: 'drop', content: 'drop', rankingScore: 0.4 }),
    ];
    const snapshot = structuredClone(input);

    const filtered = filterByRelevanceThreshold(input, 0.6);

    assert.deepEqual(input, snapshot);
    assert.equal(input.length, 2);
    filtered[0]!.content = 'mutated';
    assert.equal(input[0]!.content, 'keep');
  });

  it('P: preserves full RankedContextMemory metadata', () => {
    const input = [
      ranked({
        id: 'abc',
        content: 'I prefer PostgreSQL.',
        category: 'professional',
        importance: 0.8,
        similarity: 0.9,
        rankingScore: 0.87,
      }),
    ];

    const filtered = filterByRelevanceThreshold(input, 0.6);
    const row = filtered[0]!;

    assert.equal(row.id, 'abc');
    assert.equal(row.content, 'I prefer PostgreSQL.');
    assert.equal(row.category, 'professional');
    assert.equal(row.importance, 0.8);
    assert.equal(row.similarity, 0.9);
    assert.equal(row.rankingScore, 0.87);
    assert.deepEqual(Object.keys(row).sort(), [
      'category',
      'content',
      'id',
      'importance',
      'rankingScore',
      'similarity',
    ]);
  });
});
