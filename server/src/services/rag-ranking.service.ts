/**
 * Phase 5.6 — isolated RAG ranking (deterministic, no I/O).
 *
 * Combines similarity and importance into a rankingScore and sorts
 * candidates highest-first. Does not mutate input, access the DB,
 * call Gemini, filter by threshold, or construct prompts.
 */
import type { RelevantContextMemory } from './rag-retrieval.service.js';

/** Similarity contributes more than importance to rankingScore. */
export const SIMILARITY_WEIGHT = 0.7;
export const IMPORTANCE_WEIGHT = 0.3;

export type RankedContextMemory = RelevantContextMemory & {
  rankingScore: number;
};

/**
 * Weighted ranking score for a retrieved memory candidate.
 * rankingScore = (similarity * 0.7) + (importance * 0.3)
 */
export function computeRankingScore(
  similarity: number,
  importance: number,
): number {
  return similarity * SIMILARITY_WEIGHT + importance * IMPORTANCE_WEIGHT;
}

/**
 * Phase 5.6 — rank Phase 5.4 context candidates by rankingScore (desc).
 * Stable for equal scores: original relative order is preserved.
 * Returns a new array of new objects; does not mutate the input.
 */
export function rankRelevantContext(
  memories: RelevantContextMemory[],
): RankedContextMemory[] {
  const ranked: RankedContextMemory[] = memories.map((memory) => ({
    id: memory.id,
    content: memory.content,
    category: memory.category,
    importance: memory.importance,
    similarity: memory.similarity,
    rankingScore: computeRankingScore(memory.similarity, memory.importance),
  }));

  // Stable sort: equal rankingScore keeps original relative order.
  return ranked
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => {
      if (b.memory.rankingScore !== a.memory.rankingScore) {
        return b.memory.rankingScore - a.memory.rankingScore;
      }
      return a.index - b.index;
    })
    .map(({ memory }) => memory);
}
