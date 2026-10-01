/**
 * Phase 4.2 — cosine similarity for embedding vectors.
 * Pure math utility; independent of Gemini / storage.
 */

export type EmbeddingVector = readonly number[];

export class CosineSimilarityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CosineSimilarityError';
  }
}

function assertValidVector(vector: EmbeddingVector, label: string): void {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new CosineSimilarityError(`${label} must be a non-empty vector`);
  }

  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CosineSimilarityError(
        `${label} must contain only finite numbers`,
      );
    }
  }
}

function magnitude(vector: EmbeddingVector): number {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares);
}

/**
 * Cosine similarity of two equal-length vectors:
 * (A · B) / (||A|| × ||B||)
 *
 * Returns a number in [-1, 1] for typical non-zero vectors.
 * Throws CosineSimilarityError for empty/mismatched/zero-magnitude inputs.
 */
export function cosineSimilarity(
  a: EmbeddingVector,
  b: EmbeddingVector,
): number {
  assertValidVector(a, 'Vector A');
  assertValidVector(b, 'Vector B');

  if (a.length !== b.length) {
    throw new CosineSimilarityError(
      'Vectors must have the same dimensions',
    );
  }

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
  }

  const magA = magnitude(a);
  const magB = magnitude(b);

  if (magA === 0 || magB === 0) {
    throw new CosineSimilarityError(
      'Cannot compute cosine similarity for a zero-magnitude vector',
    );
  }

  return dot / (magA * magB);
}
