import { findBestMemoryMatch } from '../memory/matching.js';
import type { MemoryCategory } from '../memory/categories.js';
import { MEMORY_CATEGORIES } from '../memory/categories.js';
import {
  filterSafeMemoryCandidates,
  redactSecrets,
} from '../memory/privacy.js';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import {
  deleteMemoryById,
  findMemoriesByCategory,
  findMemoryById,
  getMemoryEmbeddingDimensions,
  insertMemory,
  listMemories,
  patchMemoryById,
  patchMemoryContentAndEmbedding,
  updateMemory,
  type MemoryPatchInput,
  type MemoryRecord,
  type SavedMemory,
} from '../repositories/memory.repository.js';
import type { MemoryExtractAiResponse } from '../validators/ai-memory-extract-response.validator.js';
import { generateMemoryExtraction } from './gemini.service.js';
import {
  generateEmbeddingFromMemoryContent,
  persistEmbeddingForMemory,
  type MemoryContentEmbedding,
} from './memory-embedding.service.js';

/** Treat importance as meaningfully changed when it moves by this much. */
const IMPORTANCE_DELTA = 0.05;

/** PATCH response shape — never includes the raw embedding vector. */
export type PatchedMemory = MemoryRecord & {
  embeddingDimensions: number | null;
};

export type EditMemoryDeps = {
  /**
   * Injectable for tests. Production uses Gemini via memory-embedding.service.
   * Called only when content actually changes — never for metadata-only patches.
   */
  generateEmbeddingForContent?: (
    content: string,
  ) => Promise<MemoryContentEmbedding>;
};

async function toPatchedMemory(
  memory: MemoryRecord,
  userId: string,
): Promise<PatchedMemory> {
  const embeddingDimensions = memory.hasEmbedding
    ? ((await getMemoryEmbeddingDimensions(memory.id, userId)) ??
      EMBEDDING_EXPERIMENT_DIMENSIONS)
    : null;

  return {
    ...memory,
    embeddingDimensions,
  };
}

type UpsertResult = {
  memory: SavedMemory;
  /** True when content was inserted or content text changed (embedding needed). */
  contentChanged: boolean;
};

/**
 * Persist one extracted memory: insert, update, or no-op when identical.
 * Matching and writes are scoped to userId.
 */
async function upsertExtractedMemory(
  item: {
    content: string;
    category: MemoryCategory;
    importance: number;
  },
  userId: string,
): Promise<UpsertResult> {
  const existing = await findMemoriesByCategory(item.category, userId);
  const match = findBestMemoryMatch(item.content, existing);

  if (!match) {
    const memory = await insertMemory({ ...item, userId });
    return { memory, contentChanged: true };
  }

  const existingImportance = match.memory.importance;
  const importanceChanged =
    Math.abs(item.importance - existingImportance) >= IMPORTANCE_DELTA;

  if (match.identical) {
    if (!importanceChanged) {
      // Same content and importance — keep the existing row untouched.
      return {
        memory: {
          id: match.memory.id,
          content: match.memory.content,
          category: match.memory.category,
          importance: existingImportance,
        },
        contentChanged: false,
      };
    }

    // Same content, meaningfully different importance metadata.
    const memory = await updateMemory(
      match.memory.id,
      {
        content: match.memory.content,
        importance: item.importance,
      },
      userId,
    );
    return { memory, contentChanged: false };
  }

  // Content changed — update content and take the new importance score.
  const memory = await updateMemory(
    match.memory.id,
    {
      content: item.content,
      importance: item.importance,
    },
    userId,
  );
  return { memory, contentChanged: true };
}

/**
 * Phase 3.5/3.7/3.9/3.11: redact obvious secrets, extract via Gemini,
 * privacy-filter candidates, then insert or update by same-category matching.
 * All DB access is scoped to the authenticated userId.
 */
export async function extractAndStoreMemories(
  message: string,
  userId: string,
): Promise<MemoryExtractAiResponse> {
  // Defense-in-depth: strip obvious secrets before the model sees them.
  // Non-secret context in the same message is preserved for extraction.
  const { text: safeMessage, redacted } = redactSecrets(message);

  if (redacted) {
    console.info('Memory extraction: redacted obvious secret material', {
      endpoint: '/api/ai/memory/extract',
    });
  }

  const extracted = await generateMemoryExtraction(safeMessage);

  if (extracted.memories.length === 0) {
    return { memories: [] };
  }

  // Privacy gate before any PostgreSQL write. Importance never overrides this.
  const { accepted, discardedCount } = filterSafeMemoryCandidates(
    extracted.memories,
    { allowedCategories: MEMORY_CATEGORIES },
  );

  if (discardedCount > 0) {
    console.info('Memory extraction: discarded unsafe candidates', {
      endpoint: '/api/ai/memory/extract',
      candidateCount: extracted.memories.length,
      discardedCount,
      acceptedCount: accepted.length,
    });
  }

  if (accepted.length === 0) {
    return { memories: [] };
  }

  const saved: SavedMemory[] = [];
  for (const memory of accepted) {
    const { memory: stored, contentChanged } = await upsertExtractedMemory(
      {
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
      },
      userId,
    );

    if (contentChanged) {
      try {
        await persistEmbeddingForMemory(stored.id, userId);
      } catch (error) {
        // DB write already succeeded — do not fail extraction for embedding errors.
        console.error('Memory extraction: embedding persist failed', {
          memoryId: stored.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    saved.push(stored);
  }

  return { memories: saved };
}

export class MemoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Memory not found: ${id}`);
    this.name = 'MemoryNotFoundError';
  }
}

/**
 * Phase 3.8: permanently delete a memory by id when the user asks to forget it.
 */
export async function forgetMemory(id: string, userId: string): Promise<void> {
  const deleted = await deleteMemoryById(id, userId);
  if (!deleted) {
    throw new MemoryNotFoundError(id);
  }
}

/**
 * Phase 3.10: list stored memories for a user, optionally filtered by category.
 */
export async function getMemories(
  userId: string,
  category?: MemoryCategory,
): Promise<MemoryRecord[]> {
  return listMemories(userId, category);
}

/**
 * Phase 3.10: fetch one stored memory by id owned by userId.
 */
export async function getMemory(
  id: string,
  userId: string,
): Promise<MemoryRecord> {
  const memory = await findMemoryById(id, userId);
  if (!memory) {
    throw new MemoryNotFoundError(id);
  }
  return memory;
}

/**
 * Phase 3.10 / 4.13: manually edit mutable memory fields.
 *
 * Embedding sync invariant (Phase 4.13):
 * - content change → regenerate embedding from the NEW content, then write
 *   content + embedding together.
 * - metadata-only (category / importance) → keep embedding unchanged.
 * - identical content string → do not call the embedding provider.
 *
 * Consistency strategy when Gemini is external (not transactional):
 * generate the new embedding FIRST; only then UPDATE the row. If embedding
 * generation fails, the DB is untouched — never new content + old embedding.
 */
export async function editMemory(
  id: string,
  updates: MemoryPatchInput,
  userId: string,
  deps: EditMemoryDeps = {},
): Promise<PatchedMemory> {
  const existing = await findMemoryById(id, userId);
  if (!existing) {
    throw new MemoryNotFoundError(id);
  }

  const contentProvided = updates.content !== undefined;
  const contentChanged =
    contentProvided && updates.content !== existing.content;

  if (!contentChanged) {
    // Metadata-only, or content echoed unchanged — no embedding regeneration.
    const memory = await patchMemoryById(id, updates, userId);
    if (!memory) {
      throw new MemoryNotFoundError(id);
    }
    return toPatchedMemory(memory, userId);
  }

  const generate =
    deps.generateEmbeddingForContent ?? generateEmbeddingFromMemoryContent;

  // Embed NEW content before any DB write (external API is not transactional).
  const embedding = await generate(updates.content!);

  if (embedding.dimensions !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimension: ${embedding.dimensions}`,
    );
  }

  const memory = await patchMemoryContentAndEmbedding(
    id,
    { ...updates, content: updates.content! },
    embedding.vector,
    userId,
  );
  if (!memory) {
    throw new MemoryNotFoundError(id);
  }

  return toPatchedMemory(memory, userId);
}
