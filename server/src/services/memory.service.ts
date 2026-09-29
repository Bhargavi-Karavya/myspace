import { findBestMemoryMatch } from '../memory/matching.js';
import type { MemoryCategory } from '../memory/categories.js';
import {
  deleteMemoryById,
  findMemoriesByCategory,
  insertMemory,
  updateMemory,
  type SavedMemory,
} from '../repositories/memory.repository.js';
import type { MemoryExtractAiResponse } from '../validators/ai-memory-extract-response.validator.js';
import { generateMemoryExtraction } from './gemini.service.js';

/** Treat importance as meaningfully changed when it moves by this much. */
const IMPORTANCE_DELTA = 0.05;

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
 * Phase 3.5/3.7/3.9: extract memories via Gemini, then insert or update by
 * simple same-category text overlap matching (no embeddings yet).
 */
export async function extractAndStoreMemories(
  message: string,
): Promise<MemoryExtractAiResponse> {
  const extracted = await generateMemoryExtraction(message);

  if (extracted.memories.length === 0) {
    return { memories: [] };
  }

  const saved: SavedMemory[] = [];
  for (const memory of extracted.memories) {
    saved.push(await upsertExtractedMemory(memory));
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
