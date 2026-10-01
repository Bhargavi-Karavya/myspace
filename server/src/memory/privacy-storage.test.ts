/**
 * Phase 3.11 — storage-path privacy check (no Gemini).
 * Proves secret candidates are discarded before PostgreSQL writes.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import 'dotenv/config';
import { like, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import { MEMORY_CATEGORIES } from './categories.js';
import { filterSafeMemoryCandidates, redactSecrets } from './privacy.js';
import {
  insertMemory,
  listMemories,
  deleteMemoryById,
} from '../repositories/memory.repository.js';

const MARKER = 'phase311-privacy-storage-test';

describe('privacy storage path (no Gemini)', () => {
  before(async () => {
    // Ensure DB is reachable; skip suite soft-fail is not available — assert.
    await db.select({ id: memories.id }).from(memories).limit(1);
  });

  after(async () => {
    await db.delete(memories).where(like(memories.content, `%${MARKER}%`));
  });

  it('redacts secrets from mixed messages before model would see them', () => {
    const { text, redacted } = redactSecrets(
      `I prefer PostgreSQL. ${MARKER}. My API key is sk-test-123456.`,
    );
    assert.equal(redacted, true);
    assert.match(text, /PostgreSQL/);
    assert.doesNotMatch(text, /sk-test-123456/);
  });

  it('never inserts secret-bearing candidates; keeps safe preference', async () => {
    const candidates = [
      {
        content: `User password is SuperSecret123 ${MARKER}`,
        category: 'personal' as const,
        importance: 1,
      },
      {
        content: `API key is sk-test-123456 ${MARKER}`,
        category: 'professional' as const,
        importance: 1,
      },
      {
        content: `Prefers PostgreSQL ${MARKER}`,
        category: 'preference' as const,
        importance: 0.8,
      },
    ];

    const { accepted, discardedCount } = filterSafeMemoryCandidates(
      candidates,
      { allowedCategories: MEMORY_CATEGORIES },
    );

    assert.equal(discardedCount, 2);
    assert.equal(accepted.length, 1);

    const saved = await insertMemory(accepted[0]!);
    assert.match(saved.content, /PostgreSQL/);

    const rows = await listMemories();
    const marked = rows.filter((row) => row.content.includes(MARKER));
    assert.equal(marked.length, 1);
    assert.doesNotMatch(marked[0]!.content, /SuperSecret123|sk-test-123456/i);

    const leakCount = await db
      .select({ id: memories.id })
      .from(memories)
      .where(
        or(
          like(memories.content, '%SuperSecret123%'),
          like(memories.content, '%sk-test-123456%'),
        ),
      );

    assert.equal(leakCount.length, 0);

    // Cleanup the inserted preference row.
    const toDelete = marked[0]!;
    await deleteMemoryById(toDelete.id);
  });
});
