/**
 * Phase 5.5 — RAG context construction (structured, no prompts).
 *
 * Converts Phase 5.4 RelevantContextResult into a Gemini-ready structured
 * context representation. Omits retrieval metadata (id, similarity) and never
 * includes vectors. Does not reorder, filter, truncate, or build prompts.
 */
import type { MemoryCategory } from '../memory/categories.js';
import type { RelevantContextResult } from './rag-retrieval.service.js';

/** One memory entry safe to supply as AI context later. */
export type RagContextMemory = {
  content: string;
  category: MemoryCategory;
  importance: number;
};

/** Structured RAG context — query stays separate until generation. */
export type RagContext = {
  memories: RagContextMemory[];
};

/**
 * Phase 5.5 — map retrieved context candidates into RagContext.
 * Preserves Order from Phase 5.4. Does not mutate the input.
 */
export function buildRagContext(
  retrieved: RelevantContextResult,
): RagContext {
  return {
    memories: retrieved.memories.map((memory) => ({
      content: memory.content,
      category: memory.category,
      importance: memory.importance,
    })),
  };
}
