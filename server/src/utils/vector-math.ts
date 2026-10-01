/**
 * Phase 4.3 — local vector math for embedding experiments.
 *
 * An embedding is a numerical representation of text. Each dimension is
 * part of the model's learned representation space; individual dimensions
 * should not be interpreted as simple human-readable features.
 */

export type EmbeddingVector = readonly number[];

export class VectorMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorMathError';
  }
}

function assertValidVector(vector: EmbeddingVector, label = 'Vector'): void {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new VectorMathError(`${label} must be a non-empty vector`);
  }

  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new VectorMathError(`${label} must contain only finite numbers`);
    }
  }
}

/**
 * Euclidean magnitude: sqrt(x1² + x2² + ... + xn²)
 */
export function vectorMagnitude(vector: EmbeddingVector): number {
  assertValidVector(vector);
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares);
}

/**
 * L2-normalize a vector: each component divided by ||vector||.
 * The result has magnitude ≈ 1 for non-zero inputs.
 */
export function normalizeVector(vector: EmbeddingVector): number[] {
  assertValidVector(vector);
  const magnitude = vectorMagnitude(vector);

  if (magnitude === 0) {
    throw new VectorMathError('Cannot normalize a zero-magnitude vector');
  }

  return vector.map((value) => value / magnitude);
}

export type VectorStatistics = {
  min: number;
  max: number;
  magnitude: number;
  normalizedMagnitude: number;
};

/** Round stats for readable JSON without mutating the source embedding. */
function roundStat(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Local min / max / magnitude / normalizedMagnitude for an embedding vector.
 */
export function describeVectorStatistics(
  vector: EmbeddingVector,
): VectorStatistics {
  assertValidVector(vector);

  let min = vector[0]!;
  let max = vector[0]!;
  for (let i = 1; i < vector.length; i += 1) {
    const value = vector[i]!;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const magnitude = vectorMagnitude(vector);
  const normalized = normalizeVector(vector);
  const normalizedMagnitude = vectorMagnitude(normalized);

  return {
    min: roundStat(min),
    max: roundStat(max),
    magnitude: roundStat(magnitude),
    normalizedMagnitude: roundStat(normalizedMagnitude),
  };
}
