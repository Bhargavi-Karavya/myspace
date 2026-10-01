import { asc, cosineDistance, desc, eq, sql } from 'drizzle-orm';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import { db } from '../db/index.js';
import { embeddingExperiments } from '../db/schema/embedding-experiments.js';

export type EmbeddingExperimentInsert = {
  text: string;
  embedding: number[];
};

export type EmbeddingExperimentRecord = {
  id: string;
  text: string;
  dimensions: number;
  createdAt: Date;
};

export type EmbeddingExperimentSearchHit = {
  id: string;
  text: string;
  similarity: number;
};

function logDbError(context: string, error: unknown) {
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause: unknown }).cause
      : undefined;

  console.error(context, {
    message: error instanceof Error ? error.message : String(error),
    code:
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      typeof (cause as { code: unknown }).code === 'string'
        ? (cause as { code: string }).code
        : undefined,
  });
}

export class EmbeddingDimensionMismatchError extends Error {
  constructor(actual: number) {
    super(
      `Embedding dimension mismatch: expected ${EMBEDDING_EXPERIMENT_DIMENSIONS}, got ${actual}`,
    );
    this.name = 'EmbeddingDimensionMismatchError';
  }
}

/**
 * Insert one embedding experiment row after validating vector length.
 */
export async function createEmbeddingExperiment(
  item: EmbeddingExperimentInsert,
): Promise<EmbeddingExperimentRecord> {
  if (item.embedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new EmbeddingDimensionMismatchError(item.embedding.length);
  }

  try {
    const [row] = await db
      .insert(embeddingExperiments)
      .values({
        text: item.text,
        embedding: item.embedding,
      })
      .returning({
        id: embeddingExperiments.id,
        text: embeddingExperiments.text,
        createdAt: embeddingExperiments.createdAt,
        dimensions: sql<number>`vector_dims(${embeddingExperiments.embedding})`,
      });

    return {
      id: row.id,
      text: row.text,
      dimensions: Number(row.dimensions),
      createdAt: row.createdAt,
    };
  } catch (error) {
    logDbError('Embedding experiment insert failed:', error);
    throw error;
  }
}

export async function getEmbeddingExperimentById(
  id: string,
): Promise<EmbeddingExperimentRecord | null> {
  try {
    const [row] = await db
      .select({
        id: embeddingExperiments.id,
        text: embeddingExperiments.text,
        createdAt: embeddingExperiments.createdAt,
        dimensions: sql<number>`vector_dims(${embeddingExperiments.embedding})`,
      })
      .from(embeddingExperiments)
      .where(eq(embeddingExperiments.id, id))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      text: row.text,
      dimensions: Number(row.dimensions),
      createdAt: row.createdAt,
    };
  } catch (error) {
    logDbError('Embedding experiment lookup failed:', error);
    throw error;
  }
}

export async function listEmbeddingExperiments(): Promise<
  EmbeddingExperimentRecord[]
> {
  try {
    const rows = await db
      .select({
        id: embeddingExperiments.id,
        text: embeddingExperiments.text,
        createdAt: embeddingExperiments.createdAt,
        dimensions: sql<number>`vector_dims(${embeddingExperiments.embedding})`,
      })
      .from(embeddingExperiments)
      .orderBy(desc(embeddingExperiments.createdAt));

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      dimensions: Number(row.dimensions),
      createdAt: row.createdAt,
    }));
  } catch (error) {
    logDbError('Embedding experiment list failed:', error);
    throw error;
  }
}

export async function deleteEmbeddingExperiment(
  id: string,
): Promise<boolean> {
  try {
    const deleted = await db
      .delete(embeddingExperiments)
      .where(eq(embeddingExperiments.id, id))
      .returning({ id: embeddingExperiments.id });

    return deleted.length > 0;
  } catch (error) {
    logDbError('Embedding experiment delete failed:', error);
    throw error;
  }
}

/**
 * Phase 4.6 — nearest-neighbor search via pgvector cosine distance (`<=>`).
 * Similarity exposed to callers as: 1 - distance.
 */
export async function searchSimilarEmbeddings(
  queryEmbedding: number[],
  topK: number,
): Promise<EmbeddingExperimentSearchHit[]> {
  if (queryEmbedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new EmbeddingDimensionMismatchError(queryEmbedding.length);
  }

  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error('topK must be a positive integer');
  }

  try {
    const distanceExpr = cosineDistance(
      embeddingExperiments.embedding,
      queryEmbedding,
    );

    const rows = await db
      .select({
        id: embeddingExperiments.id,
        text: embeddingExperiments.text,
        distance: distanceExpr,
      })
      .from(embeddingExperiments)
      .orderBy(asc(distanceExpr))
      .limit(topK);

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: 1 - Number(row.distance),
    }));
  } catch (error) {
    logDbError('Embedding experiment pgvector search failed:', error);
    throw error;
  }
}
