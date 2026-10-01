import { and, asc, cosineDistance, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  EMBEDDING_EXPERIMENT_DIMENSIONS,
  MEMORY_SEARCH_MAX_TOP_K,
} from '../embedding/constants.js';
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

/** Full memory row for user-facing list/get/patch responses (Phase 3.10/4.8). */
export type MemoryRecord = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  /** True when memories.embedding is non-null. Never includes the raw vector. */
  hasEmbedding: boolean;
};

export type MemoryPatchInput = {
  content?: string;
  category?: MemoryCategory;
  importance?: number;
};

/** Phase 4.9 — similarity hit from pgvector search (no raw embedding). */
export type MemorySimilarityHit = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  similarity: number;
};

export class MemoryEmbeddingDimensionMismatchError extends Error {
  constructor(actual: number) {
    super(
      `Memory embedding dimension mismatch: expected ${EMBEDDING_EXPERIMENT_DIMENSIONS}, got ${actual}`,
    );
    this.name = 'MemoryEmbeddingDimensionMismatchError';
  }
}

function toMemoryRecord(row: {
  id: string;
  content: string;
  category: string;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  hasEmbedding: boolean | unknown;
}): MemoryRecord {
  return {
    id: row.id,
    content: row.content,
    category: row.category as MemoryCategory,
    importance: row.importance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasEmbedding: Boolean(row.hasEmbedding),
  };
}

const memoryRecordColumns = {
  id: memories.id,
  content: memories.content,
  category: memories.category,
  importance: memories.importance,
  createdAt: memories.createdAt,
  updatedAt: memories.updatedAt,
  hasEmbedding: sql<boolean>`(${memories.embedding} is not null)`,
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
 * List all memories, optionally filtered by category (Phase 3.10).
 */
export async function listMemories(
  category?: MemoryCategory,
): Promise<MemoryRecord[]> {
  try {
    const rows =
      category === undefined
        ? await db
            .select(memoryRecordColumns)
            .from(memories)
            .orderBy(desc(memories.createdAt))
        : await db
            .select(memoryRecordColumns)
            .from(memories)
            .where(eq(memories.category, category))
            .orderBy(desc(memories.createdAt));

    return rows.map(toMemoryRecord);
  } catch (error) {
    logDbError('Memory list failed:', error);
    throw error;
  }
}

/**
 * Load a single memory by id (Phase 3.10).
 * @returns the memory, or null if no matching row exists.
 */
export async function findMemoryById(
  id: string,
): Promise<MemoryRecord | null> {
  try {
    const [row] = await db
      .select(memoryRecordColumns)
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1);

    return row ? toMemoryRecord(row) : null;
  } catch (error) {
    logDbError('Memory lookup by id failed:', error);
    throw error;
  }
}

/**
 * Manually patch mutable memory fields. Preserves id and createdAt.
 * @returns the updated memory, or null if no matching row exists.
 */
export async function patchMemoryById(
  id: string,
  updates: MemoryPatchInput,
): Promise<MemoryRecord | null> {
  try {
    const [row] = await db
      .update(memories)
      .set({
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.category !== undefined
          ? { category: updates.category }
          : {}),
        ...(typeof updates.importance === 'number'
          ? { importance: updates.importance }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(memories.id, id))
      .returning(memoryRecordColumns);

    return row ? toMemoryRecord(row) : null;
  } catch (error) {
    logDbError('Memory patch failed:', error);
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

/**
 * Phase 4.8 — persist a pgvector embedding for a memory.
 * Updates only embedding + updatedAt.
 */
export async function updateMemoryEmbedding(
  id: string,
  embedding: number[],
): Promise<MemoryRecord | null> {
  if (embedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new MemoryEmbeddingDimensionMismatchError(embedding.length);
  }

  try {
    const [row] = await db
      .update(memories)
      .set({
        embedding,
        updatedAt: new Date(),
      })
      .where(eq(memories.id, id))
      .returning(memoryRecordColumns);

    return row ? toMemoryRecord(row) : null;
  } catch (error) {
    logDbError('Memory embedding update failed:', error);
    throw error;
  }
}

/**
 * Phase 4.13 — update content (and optional metadata) together with a new embedding.
 * Used after Gemini successfully embeds the NEW content, so content and embedding
 * stay synchronized in a single write.
 */
export async function patchMemoryContentAndEmbedding(
  id: string,
  updates: MemoryPatchInput & { content: string },
  embedding: number[],
): Promise<MemoryRecord | null> {
  if (embedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new MemoryEmbeddingDimensionMismatchError(embedding.length);
  }

  try {
    const [row] = await db
      .update(memories)
      .set({
        content: updates.content,
        ...(updates.category !== undefined
          ? { category: updates.category }
          : {}),
        ...(typeof updates.importance === 'number'
          ? { importance: updates.importance }
          : {}),
        embedding,
        updatedAt: new Date(),
      })
      .where(eq(memories.id, id))
      .returning(memoryRecordColumns);

    return row ? toMemoryRecord(row) : null;
  } catch (error) {
    logDbError('Memory content+embedding update failed:', error);
    throw error;
  }
}

/**
 * Inspect stored embedding dimensions without returning the vector.
 */
export async function getMemoryEmbeddingDimensions(
  id: string,
): Promise<number | null> {
  try {
    const [row] = await db
      .select({
        dimensions: sql<number | null>`
          case
            when ${memories.embedding} is null then null
            else vector_dims(${memories.embedding})
          end
        `,
      })
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return row.dimensions === null || row.dimensions === undefined
      ? null
      : Number(row.dimensions);
  } catch (error) {
    logDbError('Memory embedding dimensions lookup failed:', error);
    throw error;
  }
}

/**
 * Stable fingerprint of the stored vector for tests (not exposed via API).
 * Returns null when embedding IS NULL.
 */
export async function getMemoryEmbeddingFingerprint(
  id: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({
        fingerprint: sql<string | null>`
          case
            when ${memories.embedding} is null then null
            else md5(${memories.embedding}::text)
          end
        `,
      })
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1);

    if (!row || row.fingerprint === null || row.fingerprint === undefined) {
      return null;
    }

    return String(row.fingerprint);
  } catch (error) {
    logDbError('Memory embedding fingerprint lookup failed:', error);
    throw error;
  }
}

/**
 * Phase 4.9–4.12 — nearest-neighbor Top-K retrieval over memories.embedding.
 *
 * Flow in PostgreSQL (not Node):
 *   WHERE embedding IS NOT NULL [AND category = $category]
 *   ORDER BY embedding <=> $query ASC   -- lower distance = higher similarity
 *   LIMIT $topK                         -- Top-K applied here
 *
 * Returns fewer than topK when fewer matches exist; [] when none.
 * Similarity exposed as 1 - cosine_distance. No relevance threshold yet.
 * HNSW (Phase 4.10) may accelerate large corpora; ranking semantics stay exact
 * cosine distance for this query path.
 */
export async function searchSimilarMemories(
  queryEmbedding: number[],
  topK: number,
  category?: MemoryCategory,
): Promise<MemorySimilarityHit[]> {
  if (queryEmbedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new MemoryEmbeddingDimensionMismatchError(queryEmbedding.length);
  }

  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error('topK must be a positive integer');
  }

  if (topK > MEMORY_SEARCH_MAX_TOP_K) {
    throw new Error(`topK must be at most ${MEMORY_SEARCH_MAX_TOP_K}`);
  }

  try {
    const distanceExpr = cosineDistance(memories.embedding, queryEmbedding);

    const filter =
      category === undefined
        ? isNotNull(memories.embedding)
        : and(
            isNotNull(memories.embedding),
            eq(memories.category, category),
          );

    // LIMIT is applied by PostgreSQL — do not fetch-all and slice in Node.
    const rows = await db
      .select({
        id: memories.id,
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
        distance: distanceExpr,
      })
      .from(memories)
      .where(filter)
      .orderBy(asc(distanceExpr))
      .limit(topK);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
      similarity: 1 - Number(row.distance),
    }));
  } catch (error) {
    logDbError('Memory pgvector similarity search failed:', error);
    throw error;
  }
}
