import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { memories } from '../db/schema/memories.js';
import type { MemoryCategory } from '../memory/categories.js';

export type MemoryInsertInput = {
  content: string;
  category: MemoryCategory;
  importance: number;
};

export type SavedMemory = {
  content: string;
  category: MemoryCategory;
  importance: number;
};

export type StoredMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
};

function logDbError(context: string, error: unknown) {
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause: unknown }).cause
      : undefined;

  console.error(context, {
    message: error instanceof Error ? error.message : String(error),
    code:
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      typeof (cause as { code: unknown }).code === 'string'
        ? (cause as { code: string }).code
        : undefined,
    detail:
      typeof cause === 'object' &&
      cause !== null &&
      'detail' in cause &&
      typeof (cause as { detail: unknown }).detail === 'string'
        ? (cause as { detail: string }).detail
        : undefined,
    causeMessage:
      cause instanceof Error
        ? cause.message
        : typeof cause === 'object' &&
            cause !== null &&
            'message' in cause &&
            typeof (cause as { message: unknown }).message === 'string'
          ? (cause as { message: string }).message
          : undefined,
  });
}

/**
 * Load existing memories for a single category (Phase 3.7 matching scope).
 */
export async function findMemoriesByCategory(
  category: MemoryCategory,
): Promise<StoredMemory[]> {
  try {
    const rows = await db
      .select({
        id: memories.id,
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
      })
      .from(memories)
      .where(eq(memories.category, category));

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
    }));
  } catch (error) {
    logDbError('Memory category lookup failed:', error);
    throw error;
  }
}

/**
 * Insert a single new memory row.
 */
export async function insertMemory(
  item: MemoryInsertInput,
): Promise<SavedMemory> {
  try {
    const [row] = await db
      .insert(memories)
      .values({
        content: item.content,
        category: item.category,
        importance: item.importance,
      })
      .returning({
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
      });

    return {
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
    };
  } catch (error) {
    logDbError('Memory insert failed:', error);
    throw error;
  }
}

/**
 * Update an existing memory. Preserves id and createdAt.
 */
export async function updateMemory(
  id: string,
  updates: {
    content: string;
    importance?: number;
  },
): Promise<SavedMemory> {
  try {
    const [row] = await db
      .update(memories)
      .set({
        content: updates.content,
        ...(typeof updates.importance === 'number'
          ? { importance: updates.importance }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(memories.id, id))
      .returning({
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
      });

    if (!row) {
      throw new Error('Memory update returned no row');
    }

    return {
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
    };
  } catch (error) {
    logDbError('Memory update failed:', error);
    throw error;
  }
}

/** @deprecated Prefer updateMemory — kept for callers that only change content. */
export async function updateMemoryContent(
  id: string,
  content: string,
): Promise<SavedMemory> {
  return updateMemory(id, { content });
}

/**
 * Bulk insert (kept for simple callers / tests). Prefer upsert flow in service.
 */
export async function insertMemories(
  items: MemoryInsertInput[],
): Promise<SavedMemory[]> {
  if (items.length === 0) {
    return [];
  }

  try {
    const rows = await db
      .insert(memories)
      .values(
        items.map((item) => ({
          content: item.content,
          category: item.category,
          importance: item.importance,
        })),
      )
      .returning({
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
      });

    return rows.map((row) => ({
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
    }));
  } catch (error) {
    logDbError('Memory insert failed:', error);
    throw error;
  }
}

/**
 * Permanently delete a memory by id.
 * @returns true if a row was deleted, false if no matching row existed.
 */
export async function deleteMemoryById(id: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(memories)
      .where(eq(memories.id, id))
      .returning({ id: memories.id });

    return deleted.length > 0;
  } catch (error) {
    logDbError('Memory delete failed:', error);
    throw error;
  }
}
