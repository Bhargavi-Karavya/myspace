/**
 * Phase 5.6 — RAG ranking service tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RelevantContextMemory } from './rag-retrieval.service.js';
import {
  IMPORTANCE_WEIGHT,
  SIMILARITY_WEIGHT,
  computeRankingScore,
  rankRelevantContext,
} from './rag-ranking.service.js';

function memory(
  partial: Partial<RelevantContextMemory> &
    Pick<RelevantContextMemory, 'id' | 'content'>,
): RelevantContextMemory {
  return {
    category: 'professional',
    importance: 0.5,
    similarity: 0.5,
    ...partial,
  };
}

describe('rankRelevantContext (Phase 5.6)', () => {
  it('A: computes rankingScore for a single memory', () => {
    const input = [
      memory({
        id: '1',
        content: 'I prefer PostgreSQL.',
        similarity: 0.8,
        importance: 0.9,
      }),
    ];

    const ranked = rankRelevantContext(input);

    assert.equal(SIMILARITY_WEIGHT, 0.7);
    assert.equal(IMPORTANCE_WEIGHT, 0.3);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.rankingScore, 0.83);
    assert.equal(
      ranked[0]!.rankingScore,
      computeRankingScore(0.8, 0.9),
    );
  });

  it('B: sorts multiple memories by rankingScore descending', () => {
    const input = [
      memory({
        id: 'low',
        content: 'low score',
        similarity: 0.5,
        importance: 0.4,
      }),
      memory({
        id: 'high',
        content: 'high score',
        similarity: 0.9,
        importance: 0.8,
      }),
      memory({
        id: 'mid',
        content: 'mid score',
        similarity: 0.7,
        importance: 0.6,
      }),
    ];

    const ranked = rankRelevantContext(input);

    assert.deepEqual(
      ranked.map((m) => m.id),
      ['high', 'mid', 'low'],
    );
    assert.ok(ranked[0]!.rankingScore > ranked[1]!.rankingScore);
    assert.ok(ranked[1]!.rankingScore > ranked[2]!.rankingScore);
  });

  it('C: similarity has more influence than importance (0.7 vs 0.3)', () => {
    // High similarity / low importance beats low similarity / high importance.
    const highSim = memory({
      id: 'sim',
      content: 'high similarity',
      similarity: 0.9,
      importance: 0.1,
    });
    const highImp = memory({
      id: 'imp',
      content: 'high importance',
      similarity: 0.1,
      importance: 0.9,
    });

    const ranked = rankRelevantContext([highImp, highSim]);

    assert.equal(ranked[0]!.id, 'sim');
    assert.equal(ranked[0]!.rankingScore, 0.9 * 0.7 + 0.1 * 0.3);
    assert.equal(ranked[1]!.rankingScore, 0.1 * 0.7 + 0.9 * 0.3);
    assert.ok(ranked[0]!.rankingScore > ranked[1]!.rankingScore);
  });

  it('D: importance contributes to the final score', () => {
    const lowImportance = memory({
      id: 'a',
      content: 'same similarity, lower importance',
      similarity: 0.8,
      importance: 0.2,
    });
    const highImportance = memory({
      id: 'b',
      content: 'same similarity, higher importance',
      similarity: 0.8,
      importance: 0.9,
    });

    const ranked = rankRelevantContext([lowImportance, highImportance]);

    assert.equal(ranked[0]!.id, 'b');
    assert.equal(ranked[0]!.rankingScore, 0.8 * 0.7 + 0.9 * 0.3);
    assert.equal(ranked[1]!.rankingScore, 0.8 * 0.7 + 0.2 * 0.3);
    assert.ok(ranked[0]!.rankingScore > ranked[1]!.rankingScore);
  });

  it('E: equal rankingScore preserves original relative order', () => {
    const first = memory({
      id: 'first',
      content: 'first equal',
      similarity: 0.5,
      importance: 0.5,
    });
    const second = memory({
      id: 'second',
      content: 'second equal',
      similarity: 0.5,
      importance: 0.5,
    });

    assert.equal(
      computeRankingScore(first.similarity, first.importance),
      computeRankingScore(second.similarity, second.importance),
    );

    const ranked = rankRelevantContext([first, second]);

    assert.deepEqual(
      ranked.map((m) => m.id),
      ['first', 'second'],
    );
  });

  it('F: empty input returns []', () => {
    assert.deepEqual(rankRelevantContext([]), []);
  });

  it('G: does not mutate the input array or memory objects', () => {
    const input = [
      memory({
        id: '1',
        content: 'PostgreSQL',
        similarity: 0.6,
        importance: 0.4,
      }),
      memory({
        id: '2',
        content: 'Redis',
        similarity: 0.9,
        importance: 0.8,
      }),
    ];
    const snapshot = structuredClone(input);

    const ranked = rankRelevantContext(input);

    assert.deepEqual(input, snapshot);
    assert.equal(input[0]!.id, '1');
    assert.equal(input[1]!.id, '2');
    assert.ok(!('rankingScore' in input[0]!));
    assert.ok(!('rankingScore' in input[1]!));

    ranked[0]!.content = 'mutated';
    assert.equal(input[1]!.content, 'Redis');
  });

  it('H: preserves retrieval metadata and adds rankingScore', () => {
    const input = [
      memory({
        id: 'abc',
        content: 'I prefer PostgreSQL.',
        category: 'professional',
        importance: 0.8,
        similarity: 0.75,
      }),
    ];

    const ranked = rankRelevantContext(input);
    const row = ranked[0]!;

    assert.equal(row.id, 'abc');
    assert.equal(row.content, 'I prefer PostgreSQL.');
    assert.equal(row.category, 'professional');
    assert.equal(row.importance, 0.8);
    assert.equal(row.similarity, 0.75);
    assert.equal(typeof row.rankingScore, 'number');
    assert.deepEqual(Object.keys(row).sort(), [
      'category',
      'content',
      'id',
      'importance',
      'rankingScore',
      'similarity',
    ]);
  });

  it('I: does not include embedding/vector data', () => {
    const leaky = {
      id: '1',
      content: 'PostgreSQL',
      category: 'professional' as const,
      importance: 0.8,
      similarity: 0.75,
      embedding: Array.from({ length: 3072 }, () => 0),
      vector: [1, 0, 0],
    } as RelevantContextMemory & {
      embedding: number[];
      vector: number[];
    };

    const ranked = rankRelevantContext([leaky]);
    const row = ranked[0]!;
    const serialized = JSON.stringify(ranked);

    assert.ok(!('embedding' in row));
    assert.ok(!('vector' in row));
    assert.equal(serialized.includes('embedding'), false);
    assert.equal(serialized.includes('vector'), false);
    assert.equal(serialized.includes('3072'), false);
    assert.equal(leaky.embedding.length, 3072);
  });

  it('J: keeps decimal precision without unnecessary rounding', () => {
    const similarity = 0.8123456789;
    const importance = 0.4567890123;
    const expected =
      similarity * SIMILARITY_WEIGHT + importance * IMPORTANCE_WEIGHT;

    const ranked = rankRelevantContext([
      memory({
        id: 'precise',
        content: 'precise decimals',
        similarity,
        importance,
      }),
    ]);

    assert.equal(ranked[0]!.rankingScore, expected);
    assert.equal(ranked[0]!.rankingScore, computeRankingScore(similarity, importance));
  });
});
