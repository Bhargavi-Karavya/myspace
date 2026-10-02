/**
 * Phase 4.11 — optional category metadata filter for memory similarity search.
 * Requires PostgreSQL + pgvector. Uses deterministic unit-vector fixtures.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { MEMORY_CATEGORIES } from '../memory/categories.js';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import {
  deleteMemoryById,
  insertMemory,
  searchSimilarMemories,
  updateMemoryEmbedding,
} from '../repositories/memory.repository.js';
import { memorySearchRequestSchema } from '../validators/ai.validator.js';

const MARKER = 'phase411-category-filter';

const TEST_USER_ID = 'test-user-phase49';

function unitAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_EXPERIMENT_DIMENSIONS }, (_, i) =>
    i === index ? 1 : 0,
  );
}

describe('memorySearchRequestSchema category (Phase 4.11)', () => {
  it('rejects an invalid category with validation failure (→ 400)', () => {
    const parsed = memorySearchRequestSchema.safeParse({
      query: 'hello',
      category: 'not-a-category',
      topK: 3,
    });
    assert.equal(parsed.success, false);
  });

  it('accepts each known memory category', () => {
    for (const category of MEMORY_CATEGORIES) {
      const parsed = memorySearchRequestSchema.safeParse({
        query: 'hello',
        category,
        topK: 3,
      });
      assert.equal(parsed.success, true, category);
      if (parsed.success) {
        assert.equal(parsed.data.category, category);
      }
    }
  });

  it('allows omitting category (unfiltered search)', () => {
    const parsed = memorySearchRequestSchema.safeParse({
      query: 'What database do I prefer?',
      topK: 3,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.category, undefined);
    }
  });
});

describe('searchSimilarMemories category filter (requires PostgreSQL + pgvector)', () => {
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

  async function seedCategoryFixtures() {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));

    // Distinct orthogonal axes so ranking within a category is deterministic.
    const fixtures: Array<{
      content: string;
      category: (typeof MEMORY_CATEGORIES)[number];
      axis: number;
    }> = [
      {
        content: `${MARKER} prefer typescript`,
        category: 'preference',
        axis: 0,
      },
      {
        content: `${MARKER} prefer postgres`,
        category: 'preference',
        axis: 1,
      },
      {
        content: `${MARKER} professional backend`,
        category: 'professional',
        axis: 2,
      },
      {
        content: `${MARKER} personal hobby`,
        category: 'personal',
        axis: 3,
      },
      {
        content: `${MARKER} goal interviews`,
        category: 'goal',
        axis: 4,
      },
      {
        content: `${MARKER} other note`,
        category: 'other',
        axis: 5,
      },
      {
        content: `${MARKER} professional null embedding`,
        category: 'professional',
        axis: -1,
      },
    ];

    const idsByLabel: Record<string, string> = {};

    for (const fixture of fixtures) {
      await insertMemory({
        content: fixture.content,
        category: fixture.category,
        importance: 0.5,
      userId: TEST_USER_ID,
    });
    }

    const rows = await db
      .select({
        id: memories.id,
        content: memories.content,
        category: memories.category,
      })
      .from(memories)
      .where(like(memories.content, `%${MARKER}%`));

    for (const row of rows) {
      createdIds.push(row.id);
      idsByLabel[row.content] = row.id;
      const fixture = fixtures.find((f) => f.content === row.content)!;
      if (fixture.axis >= 0) {
        await updateMemoryEmbedding(row.id, unitAt(fixture.axis), TEST_USER_ID);
      }
    }

    return idsByLabel;
  }

  it('without category behaves as unfiltered search (includes all categories)', async () => {
    const ids = await seedCategoryFixtures();
    const results = await searchSimilarMemories(unitAt(2), 50, { userId: TEST_USER_ID });
    const marked = results.filter((r) => r.content.includes(MARKER));

    assert.ok(marked.length >= 5);
    const categories = new Set(marked.map((r) => r.category));
    assert.ok(categories.has('professional'));
    assert.ok(categories.has('preference'));
    assert.ok(
      !marked.some(
        (r) => r.id === ids[`${MARKER} professional null embedding`],
      ),
    );
  });

  it('filters to professional only and ignores NULL embeddings', async () => {
    const ids = await seedCategoryFixtures();
    const results = await searchSimilarMemories(unitAt(2), 10, { userId: TEST_USER_ID, category: 'professional' });
    const marked = results.filter((r) => r.content.includes(MARKER));

    assert.equal(marked.length, 1);
    assert.equal(marked[0]!.id, ids[`${MARKER} professional backend`]);
    assert.ok(
      marked.every((r) => r.category === 'professional'),
    );
    assert.ok(
      !marked.some(
        (r) => r.id === ids[`${MARKER} professional null embedding`],
      ),
    );
    for (const hit of marked) {
      assert.ok(!('embedding' in hit));
    }
  });

  it('filters each known category', async () => {
    const ids = await seedCategoryFixtures();
    const cases: Array<{
      category: (typeof MEMORY_CATEGORIES)[number];
      axis: number;
      content: string;
    }> = [
      {
        category: 'preference',
        axis: 0,
        content: `${MARKER} prefer typescript`,
      },
      {
        category: 'professional',
        axis: 2,
        content: `${MARKER} professional backend`,
      },
      {
        category: 'personal',
        axis: 3,
        content: `${MARKER} personal hobby`,
      },
      { category: 'goal', axis: 4, content: `${MARKER} goal interviews` },
      { category: 'other', axis: 5, content: `${MARKER} other note` },
    ];

    for (const c of cases) {
      const results = await searchSimilarMemories(unitAt(c.axis), 10, { userId: TEST_USER_ID, category: c.category });
      const marked = results.filter((r) => r.content.includes(MARKER));
      assert.ok(marked.length >= 1, c.category);
      assert.ok(
        marked.every((r) => r.category === c.category),
        c.category,
      );
      assert.equal(marked[0]!.id, ids[c.content], c.category);
    }
  });

  it('returns [] when category has no embedded memories', async () => {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
    await insertMemory({
      content: `${MARKER} only-null-goal`,
      category: 'goal',
      importance: 0.4,
      userId: TEST_USER_ID,
    });
    const [row] = await db
      .select({ id: memories.id })
      .from(memories)
      .where(like(memories.content, `${MARKER} only-null-goal`));
    createdIds.push(row!.id);

    // Preference has no fixture rows at all in this isolated cleanup.
    const results = await searchSimilarMemories(unitAt(0), 5, { userId: TEST_USER_ID, category: 'preference' });
    const marked = results.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 0);

    // Goal exists but embedding is NULL → still empty for this marker set.
    const goalResults = await searchSimilarMemories(unitAt(0), 5, { userId: TEST_USER_ID, category: 'goal' });
    const goalMarked = goalResults.filter((r) => r.content.includes(MARKER));
    assert.equal(goalMarked.length, 0);
  });

  it('respects topK and similarity ordering within a category', async () => {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));

    await insertMemory({
      content: `${MARKER} pref-near`,
      category: 'preference',
      importance: 0.8,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} pref-mid`,
      category: 'preference',
      importance: 0.6,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} pref-far`,
      category: 'preference',
      importance: 0.4,
      userId: TEST_USER_ID,
    });
    await insertMemory({
      content: `${MARKER} pro-distract`,
      category: 'professional',
      importance: 0.9,
      userId: TEST_USER_ID,
    });

    const rows = await db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(like(memories.content, `%${MARKER}%`));

    const byContent = Object.fromEntries(rows.map((r) => [r.content, r.id]));
    createdIds.push(...rows.map((r) => r.id));

    await updateMemoryEmbedding(byContent[`${MARKER} pref-near`]!, unitAt(0), TEST_USER_ID);
    await updateMemoryEmbedding(byContent[`${MARKER} pref-mid`]!, unitAt(1), TEST_USER_ID);
    await updateMemoryEmbedding(byContent[`${MARKER} pref-far`]!, unitAt(2), TEST_USER_ID);
    // Professional on same near axis — must be excluded by category filter.
    await updateMemoryEmbedding(
      byContent[`${MARKER} pro-distract`]!,
      unitAt(0), TEST_USER_ID);

    const query = unitAt(0);
    query[0] = 0.9;
    query[1] = Math.sqrt(1 - 0.9 ** 2);

    const top1 = await searchSimilarMemories(query, 1, { userId: TEST_USER_ID, category: 'preference' });
    assert.equal(top1.length, 1);
    assert.equal(top1[0]!.category, 'preference');
    assert.equal(top1[0]!.id, byContent[`${MARKER} pref-near`]);

    const ranked = await searchSimilarMemories(query, 10, { userId: TEST_USER_ID, category: 'preference' });
    const marked = ranked.filter((r) => r.content.includes(MARKER));
    assert.equal(marked.length, 3);
    assert.deepEqual(
      marked.map((r) => r.id),
      [
        byContent[`${MARKER} pref-near`],
        byContent[`${MARKER} pref-mid`],
        byContent[`${MARKER} pref-far`],
      ],
    );
    assert.ok(marked[0]!.similarity >= marked[1]!.similarity);
    assert.ok(marked.every((r) => r.category === 'preference'));
    assert.ok(!marked.some((r) => r.id === byContent[`${MARKER} pro-distract`]));
    for (const hit of marked) {
      assert.equal(
        Object.keys(hit).sort().join(','),
        'category,content,id,importance,similarity',
      );
    }
  });
});
