/**
 * Phase 5.7 — isolated RAG relevance threshold (pure filter, no I/O).
 *
 * Keeps ranked memories whose rankingScore meets a minimum threshold.
 * Does not re-rank, re-score, access the DB, call Gemini, or modify HTTP.
 */
import type { RankedContextMemory } from './rag-ranking.service.js';

/** Default minimum rankingScore for a memory to remain relevant. */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.6;

export class RelevanceThresholdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelevanceThresholdError';
  }
}

function assertValidThreshold(threshold: number): void {
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    throw new RelevanceThresholdError(
      'Relevance threshold must be a finite number between 0 and 1 inclusive',
    );
  }
}

/**
 * Phase 5.7 — keep memories with rankingScore >= threshold.
 * Preserves input order. Returns a new array of shallow copies;
 * does not mutate the input array or memory objects.
 */
export function filterByRelevanceThreshold(
  memories: RankedContextMemory[],
  threshold: number = DEFAULT_RELEVANCE_THRESHOLD,
): RankedContextMemory[] {
  assertValidThreshold(threshold);

  return memories
    .filter((memory) => memory.rankingScore >= threshold)
    .map((memory) => ({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      importance: memory.importance,
      similarity: memory.similarity,
      rankingScore: memory.rankingScore,
    }));
}
