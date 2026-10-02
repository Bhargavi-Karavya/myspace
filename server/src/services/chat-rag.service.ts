/**
 * Chat-facing RAG pipeline: retrieve → rank → threshold → context construction.
 * Reuses Phase 5 services; only adds user ownership at retrieval.
 */
import { buildRagContext, type RagContext } from './context-construction.service.js';
import { rankRelevantContext } from './rag-ranking.service.js';
import {
  retrieveRelevantContext,
  type RagRetrievalDeps,
} from './rag-retrieval.service.js';
import { filterByRelevanceThreshold } from './rag-threshold.service.js';

export type BuildUserRagContextInput = {
  query: string;
  userId: string;
  topK?: number;
};

/**
 * Build structured RAG context for the authenticated user's memories only.
 * Returns empty memories when none are relevant (caller still answers from chat).
 */
export async function buildUserRagContextForChat(
  input: BuildUserRagContextInput,
  deps: RagRetrievalDeps = {},
): Promise<RagContext> {
  const retrieved = await retrieveRelevantContext(
    {
      query: input.query,
      userId: input.userId,
      topK: input.topK,
    },
    deps,
  );

  const ranked = rankRelevantContext(retrieved.memories);
  const filtered = filterByRelevanceThreshold(ranked);

  return buildRagContext({
    query: retrieved.query,
    memories: filtered,
  });
}

/**
 * Format RagContext for Gemini system instruction.
 * Never includes ids, vectors, or similarity scores.
 */
export function formatRagContextForSystemInstruction(
  context: RagContext,
): string {
  if (context.memories.length === 0) {
    return '';
  }

  const lines = context.memories.map(
    (memory, index) =>
      `${index + 1}. [${memory.category}, importance ${memory.importance.toFixed(2)}] ${memory.content}`,
  );

  return [
    'Relevant personal memories for this user (use only if helpful; do not invent personal facts not listed here):',
    ...lines,
  ].join('\n');
}
