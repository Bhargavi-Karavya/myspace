/**
 * Phase 5.5 — context construction service tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRagContext,
  type RagContext,
} from './context-construction.service.js';
import type {
  RelevantContextMemory,
  RelevantContextResult,
} from './rag-retrieval.service.js';

function makeMemory(
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

describe('buildRagContext (Phase 5.5)', () => {
  it('A: maps a single memory to content/category/importance only', () => {
    const input: RelevantContextResult = {
      query: 'What database do I usually prefer?',
      memories: [
        makeMemory({
          id: '123',
          content: 'I prefer PostgreSQL for backend projects.',
          category: 'professional',
          importance: 0.75,
          similarity: 0.76,
        }),
      ],
    };

    const context = buildRagContext(input);

    assert.deepEqual(context, {
      memories: [
        {
          content: 'I prefer PostgreSQL for backend projects.',
          category: 'professional',
          importance: 0.75,
        },
      ],
    });

    const memory = context.memories[0]!;
    assert.ok(!('id' in memory));
    assert.ok(!('similarity' in memory));
    assert.ok(!('embedding' in memory));
    assert.ok(!('vector' in memory));
    assert.ok(!('query' in context));
  });

  it('B: includes all memories and preserves Phase 5.4 ordering', () => {
    const input: RelevantContextResult = {
      query: 'databases',
      memories: [
        makeMemory({
          id: 'a',
          content: 'I prefer PostgreSQL for backend projects.',
          importance: 0.75,
          similarity: 0.76,
        }),
        makeMemory({
          id: 'b',
          content: 'I use Redis for caching.',
          importance: 0.88,
          similarity: 0.63,
        }),
        makeMemory({
          id: 'c',
          content: 'I like SQLite for local tools.',
          category: 'preference',
          importance: 0.4,
          similarity: 0.55,
        }),
      ],
    };

    const context = buildRagContext(input);

    assert.equal(context.memories.length, 3);
    assert.deepEqual(
      context.memories.map((m) => m.content),
      [
        'I prefer PostgreSQL for backend projects.',
        'I use Redis for caching.',
        'I like SQLite for local tools.',
      ],
    );
    assert.deepEqual(
      context.memories.map((m) => m.importance),
      [0.75, 0.88, 0.4],
    );
  });

  it('C: empty retrieval produces empty context', () => {
    const input: RelevantContextResult = {
      query: 'some unrelated question',
      memories: [],
    };

    const context = buildRagContext(input);

    assert.deepEqual(context, { memories: [] });
  });

  it('D: does not mutate the original RelevantContextResult', () => {
    const input: RelevantContextResult = {
      query: 'What database do I usually prefer?',
      memories: [
        makeMemory({
          id: '123',
          content: 'I prefer PostgreSQL for backend projects.',
          importance: 0.75,
          similarity: 0.76,
        }),
      ],
    };
    const snapshot = structuredClone(input);

    const context = buildRagContext(input);

    assert.deepEqual(input, snapshot);
    context.memories[0]!.content = 'mutated';
    assert.equal(
      input.memories[0]!.content,
      'I prefer PostgreSQL for backend projects.',
    );
    assert.equal(input.memories[0]!.id, '123');
    assert.equal(input.memories[0]!.similarity, 0.76);
  });

  it('E: similarity is removed from RagContext', () => {
    const input: RelevantContextResult = {
      query: 'q',
      memories: [
        makeMemory({ id: '1', content: 'high', similarity: 0.99 }),
        makeMemory({ id: '2', content: 'low', similarity: 0.11 }),
      ],
    };

    const context = buildRagContext(input);
    const serialized = JSON.stringify(context);

    assert.equal(serialized.includes('similarity'), false);
    assert.equal(serialized.includes('0.99'), false);
    assert.equal(serialized.includes('0.11'), false);
    for (const memory of context.memories) {
      assert.ok(!('similarity' in memory));
    }
  });

  it('F: memory IDs are removed from RagContext', () => {
    const input: RelevantContextResult = {
      query: 'q',
      memories: [
        makeMemory({
          id: '7ee53e83-d586-4747-b639-c2fd0f47bc71',
          content: 'PostgreSQL',
        }),
      ],
    };

    const context = buildRagContext(input);
    const serialized = JSON.stringify(context);

    assert.equal(serialized.includes('7ee53e83'), false);
    assert.ok(!('id' in context.memories[0]!));
  });

  it('G: does not copy accidental embedding/vector fields into context', () => {
    const leaky = {
      id: 'leak-id',
      content: 'I prefer PostgreSQL for backend projects.',
      category: 'professional' as const,
      importance: 0.75,
      similarity: 0.76,
      embedding: Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0)),
      vector: [1, 0, 0],
    };

    const input = {
      query: 'What database do I usually prefer?',
      memories: [leaky],
    } as unknown as RelevantContextResult;

    const context: RagContext = buildRagContext(input);
    const memory = context.memories[0]!;
    const serialized = JSON.stringify(context);

    assert.deepEqual(Object.keys(memory).sort(), [
      'category',
      'content',
      'importance',
    ]);
    assert.ok(!('embedding' in memory));
    assert.ok(!('vector' in memory));
    assert.ok(!('id' in memory));
    assert.ok(!('similarity' in memory));
    assert.equal(serialized.includes('embedding'), false);
    assert.equal(serialized.includes('vector'), false);
    assert.equal(serialized.includes('3072'), false);
    assert.equal(leaky.embedding.length, 3072);
    assert.deepEqual(leaky.vector, [1, 0, 0]);
  });
});
