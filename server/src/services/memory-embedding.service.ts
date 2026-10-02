import {
  EMBEDDING_EXPERIMENT_DIMENSIONS,
  MEMORY_SEARCH_DEFAULT_TOP_K,
} from '../embedding/constants.js';
import type { MemoryCategory } from '../memory/categories.js';
import {
  getMemoryEmbeddingDimensions,
  searchSimilarMemories,
  updateMemoryEmbedding,
  type MemorySimilarityHit,
  MemoryEmbeddingDimensionMismatchError,
} from '../repositories/memory.repository.js';
import {
  generateTextEmbeddings,
  type TextEmbeddingResult,
} from './embedding.service.js';
import { getMemory, MemoryNotFoundError } from './memory.service.js';

export { MemoryNotFoundError, MemoryEmbeddingDimensionMismatchError };
export { MEMORY_SEARCH_DEFAULT_TOP_K };

export type MemoryContentEmbedding = {
  dimensions: number;
  vector: number[];
};

export type MemoryEmbeddingTestResult = {
  memory: {
    id: string;
    content: string;
  };
  embedding: MemoryContentEmbedding;
};

export type PersistedMemoryEmbeddingResult = {
  memory: {
    id: string;
    content: string;
    embeddingDimensions: number;
    hasEmbedding: boolean;
  };
};

export type MemorySearchResult = {
  query: string;
  results: MemorySimilarityHit[];
};

/**
 * Phase 4.7 — convert memory content text into an embedding vector.
 * Reuses the existing Gemini embedding service. Does not persist.
 */
export async function generateEmbeddingFromMemoryContent(
  content: string,
): Promise<MemoryContentEmbedding> {
  const { embeddings } = await generateTextEmbeddings([content]);
  const item: TextEmbeddingResult = embeddings[0]!;

  return {
    dimensions: item.embedding.length,
    vector: item.embedding,
  };
}

/**
 * Phase 4.7 — load a stored memory owned by userId and generate an embedding
 * from its content. Does not write to PostgreSQL or modify the memory row.
 */
export async function generateEmbeddingForMemory(
  id: string,
  userId: string,
): Promise<MemoryEmbeddingTestResult> {
  const memory = await getMemory(id, userId);
  const embedding = await generateEmbeddingFromMemoryContent(memory.content);

  return {
    memory: {
      id: memory.id,
      content: memory.content,
    },
    embedding,
  };
}

/**
 * Phase 4.8 — generate an embedding for a user-owned memory and persist it.
 * Does not return the raw vector.
 */
export async function persistEmbeddingForMemory(
  id: string,
  userId: string,
): Promise<PersistedMemoryEmbeddingResult> {
  const memory = await getMemory(id, userId);
  const embedding = await generateEmbeddingFromMemoryContent(memory.content);

  if (embedding.dimensions !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimension: ${embedding.dimensions}`,
    );
  }

  const updated = await updateMemoryEmbedding(id, embedding.vector, userId);
  if (!updated) {
    throw new MemoryNotFoundError(id);
  }

  const dimensions =
    (await getMemoryEmbeddingDimensions(id, userId)) ?? embedding.dimensions;

  return {
    memory: {
      id: updated.id,
      content: updated.content,
      embeddingDimensions: dimensions,
      hasEmbedding: updated.hasEmbedding,
    },
  };
}

/**
 * Phase 4.9–4.12 — embed a query and Top-K search real memories via pgvector.
 * Ranking + LIMIT + user ownership filter happen in PostgreSQL.
 * When fewer than topK matches exist, all matches are returned (no error).
 */
export async function searchMemoriesBySimilarity(
  query: string,
  topK: number = MEMORY_SEARCH_DEFAULT_TOP_K,
  options: { userId: string; category?: MemoryCategory },
): Promise<MemorySearchResult> {
  const { embeddings } = await generateTextEmbeddings([query]);
  const queryVector = embeddings[0]!.embedding;

  if (queryVector.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new MemoryEmbeddingDimensionMismatchError(queryVector.length);
  }

  const results = await searchSimilarMemories(queryVector, topK, options);
  return { query, results };
}

export function isExpectedMemoryEmbeddingDimension(
  dimensions: number,
): boolean {
  return dimensions === EMBEDDING_EXPERIMENT_DIMENSIONS;
}
