/**
 * Phase 5.3 — dedicated query-embedding layer for the RAG pipeline.
 *
 * Responsibility: normalize a user query → reuse Gemini text embeddings →
 * return the vector for internal retrieval only.
 *
 * Does not create a second Gemini client, model config, or embedding API path.
 * Raw vectors must not be exposed over HTTP.
 */
import { ragQuerySchema } from '../validators/ai.validator.js';
import {
  generateTextEmbeddings,
  type EmbeddingTestResult,
} from './embedding.service.js';

export class QueryEmbeddingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryEmbeddingInputError';
  }
}

/**
 * Internal result for RAG retrieval. Callers must not serialize `vector`
 * into HTTP responses.
 */
export type QueryEmbeddingResult = {
  /** Trimmed query that was embedded. */
  query: string;
  /** Dimension count reported by the embedding service. */
  dimensions: number;
  /** Raw embedding — internal use only. */
  vector: number[];
};

/** Safe metadata for tests/debug — never includes the raw vector. */
export type QueryEmbeddingMetadata = {
  query: string;
  dimensions: number;
};

export type QueryEmbeddingDeps = {
  /** Override Gemini text embedding (tests). */
  generateTextEmbeddings?: (texts: string[]) => Promise<EmbeddingTestResult>;
};

/**
 * Validate and trim a RAG query using the shared Zod schema.
 */
export function normalizeQueryForEmbedding(query: unknown): string {
  const parsed = ragQuerySchema.safeParse(query);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? 'Query is required';
    throw new QueryEmbeddingInputError(message);
  }
  return parsed.data;
}

/**
 * Phase 5.3 — embed a user query for retrieval.
 * Reuses `generateTextEmbeddings`; does not persist or return HTTP payloads.
 */
export async function generateQueryEmbedding(
  query: unknown,
  deps: QueryEmbeddingDeps = {},
): Promise<QueryEmbeddingResult> {
  const normalized = normalizeQueryForEmbedding(query);
  const embed = deps.generateTextEmbeddings ?? generateTextEmbeddings;

  const { embeddings } = await embed([normalized]);
  const item = embeddings[0]!;

  return {
    query: normalized,
    dimensions: item.dimensions,
    vector: item.embedding,
  };
}

/** Strip the raw vector — safe shape for any future test endpoint. */
export function toQueryEmbeddingMetadata(
  result: QueryEmbeddingResult,
): QueryEmbeddingMetadata {
  return {
    query: result.query,
    dimensions: result.dimensions,
  };
}
