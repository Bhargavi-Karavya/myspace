/**
 * Phase 4.4 — in-memory similarity search over embedding vectors.
 * Generic: not tied to memories. Does not store or query PostgreSQL.
 */

import {
  CosineSimilarityError,
  cosineSimilarity,
  type EmbeddingVector,
} from './cosine-similarity.js';

export type SimilaritySearchCandidate = {
  id: string;
  text: string;
  vector: EmbeddingVector;
};

export type SimilaritySearchResult = {
  id: string;
  text: string;
  similarity: number;
};

export class SimilaritySearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimilaritySearchError';
  }
}

/**
 * Rank candidates by cosine similarity to a query vector (highest first).
 * Ties keep original candidate order (stable / deterministic).
 */
export function searchSimilarVectors(
  queryVector: EmbeddingVector,
  candidates: readonly SimilaritySearchCandidate[],
  topK?: number,
): SimilaritySearchResult[] {
  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    throw new SimilaritySearchError('Query vector must be a non-empty vector');
  }

  if (!Array.isArray(candidates)) {
    throw new SimilaritySearchError('Candidates must be an array');
  }

  if (candidates.length === 0) {
    return [];
  }

  if (topK !== undefined) {
    if (!Number.isInteger(topK) || topK < 1) {
      throw new SimilaritySearchError('topK must be a positive integer');
    }
  }

  const scored: Array<SimilaritySearchResult & { index: number }> = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;

    if (candidate.vector.length !== queryVector.length) {
      throw new SimilaritySearchError(
        'Candidate vector dimensions must match the query vector',
      );
    }

    let similarity: number;
    try {
      similarity = cosineSimilarity(queryVector, candidate.vector);
    } catch (error) {
      if (error instanceof CosineSimilarityError) {
        throw new SimilaritySearchError(error.message);
      }
      throw error;
    }

    scored.push({
      id: candidate.id,
      text: candidate.text,
      similarity,
      index,
    });
  }

  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) {
      return b.similarity - a.similarity;
    }
    // Deterministic tie-break: original candidate order.
    return a.index - b.index;
  });

  const ranked = scored.map(({ id, text, similarity }) => ({
    id,
    text,
    similarity,
  }));

  if (topK === undefined) {
    return ranked;
  }

  return ranked.slice(0, Math.min(topK, ranked.length));
}
