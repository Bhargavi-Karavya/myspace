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

async function toPatchedMemory(memory: MemoryRecord): Promise<PatchedMemory> {
  const embeddingDimensions = memory.hasEmbedding
    ? ((await getMemoryEmbeddingDimensions(memory.id)) ??
      EMBEDDING_EXPERIMENT_DIMENSIONS)
    : null;

  return {
    ...memory,
    embeddingDimensions,
  };
}

/**
 * Persist one extracted memory: insert, update, or no-op when identical.
 */
async function upsertExtractedMemory(item: {
  content: string;
  category: MemoryCategory;
  importance: number;
}): Promise<SavedMemory> {
  const existing = await findMemoriesByCategory(item.category);
  const match = findBestMemoryMatch(item.content, existing);

  if (!match) {
    return insertMemory(item);
  }

  const existingImportance = match.memory.importance;
  const importanceChanged =
    Math.abs(item.importance - existingImportance) >= IMPORTANCE_DELTA;

  if (match.identical) {
    if (!importanceChanged) {
      // Same content and importance — keep the existing row untouched.
      return {
        content: match.memory.content,
        category: match.memory.category,
        importance: existingImportance,
      };
    }

    // Same content, meaningfully different importance metadata.
    return updateMemory(match.memory.id, {
      content: match.memory.content,
      importance: item.importance,
    });
  }

  // Content changed — update content and take the new importance score.
  return updateMemory(match.memory.id, {
    content: item.content,
    importance: item.importance,
  });
}

/**
 * Phase 3.5/3.7/3.9/3.11: redact obvious secrets, extract via Gemini,
 * privacy-filter candidates, then insert or update by same-category matching.
 */
export async function extractAndStoreMemories(
  message: string,
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
    saved.push(
      await upsertExtractedMemory({
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
      }),
    );
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
export async function forgetMemory(id: string): Promise<void> {
  const deleted = await deleteMemoryById(id);
  if (!deleted) {
    throw new MemoryNotFoundError(id);
  }
}

/**
 * Phase 3.10: list stored memories, optionally filtered by category.
 */
export async function getMemories(
  category?: MemoryCategory,
): Promise<MemoryRecord[]> {
  return listMemories(category);
}

/**
 * Phase 3.10: fetch one stored memory by id.
 */
export async function getMemory(id: string): Promise<MemoryRecord> {
  const memory = await findMemoryById(id);
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
  deps: EditMemoryDeps = {},
): Promise<PatchedMemory> {
  const existing = await findMemoryById(id);
  if (!existing) {
    throw new MemoryNotFoundError(id);
  }

  const contentProvided = updates.content !== undefined;
  const contentChanged =
    contentProvided && updates.content !== existing.content;

  if (!contentChanged) {
    // Metadata-only, or content echoed unchanged — no embedding regeneration.
    const memory = await patchMemoryById(id, updates);
    if (!memory) {
      throw new MemoryNotFoundError(id);
    }
    return toPatchedMemory(memory);
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
  );
  if (!memory) {
    throw new MemoryNotFoundError(id);
  }

  return toPatchedMemory(memory);
}
