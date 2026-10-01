/**
 * Phase 5.2/5.3/5.4 — RAG relevant-context retrieval (no answer generation).
 *
 * Flow: user query → query embedding → pgvector search → context candidates.
 * Phase 5.4 names the result as context candidates (`memories`); ranking and
 * search behavior are unchanged from Phase 5.2. No thresholds, custom ranking,
 * prompt construction, or chat integration.
 */
import {
  EMBEDDING_EXPERIMENT_DIMENSIONS,
  MEMORY_SEARCH_DEFAULT_TOP_K,
} from '../embedding/constants.js';
import type { MemoryCategory } from '../memory/categories.js';
import {
  MemoryEmbeddingDimensionMismatchError,
  searchSimilarMemories,
  type MemorySimilarityHit,
} from '../repositories/memory.repository.js';
import {
  generateQueryEmbedding,
  type QueryEmbeddingResult,
} from './query-embedding.service.js';

export { MemoryEmbeddingDimensionMismatchError };
export { MEMORY_SEARCH_DEFAULT_TOP_K };

/** Phase 5.4 — one memory candidate for future AI context. */
export type RelevantContextMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  similarity: number;
};

/** Phase 5.4 — internal service result (`memories`, not public `results`). */
export type RelevantContextResult = {
  query: string;
  memories: RelevantContextMemory[];
};

export type RetrieveRelevantContextInput = {
  query: string;
  topK?: number;
  category?: MemoryCategory;
};

/** @deprecated Prefer RelevantContextMemory — kept for Phase 5.2 naming. */
export type RagRetrievedMemory = RelevantContextMemory;

/** @deprecated Prefer RelevantContextResult — public HTTP still uses `results`. */
export type RagRetrievalResult = {
  query: string;
  results: RelevantContextMemory[];
};

export type RagRetrievalDeps = {
  /** Override Phase 5.3 query embedding (tests). */
  generateQueryEmbedding?: (
    query: unknown,
  ) => Promise<QueryEmbeddingResult>;
  /** Override pgvector memory search (tests). */
  searchMemories?: (
    queryEmbedding: number[],
    topK: number,
    category?: MemoryCategory,
  ) => Promise<MemorySimilarityHit[]>;
};

function toContextMemory(hit: MemorySimilarityHit): RelevantContextMemory {
  return {
    id: hit.id,
    content: hit.content,
    category: hit.category,
    importance: hit.importance,
    similarity: hit.similarity,
  };
}

/**
 * Phase 5.4 — retrieve memories that are candidates to become AI context.
 * Single implementation of query embedding + semantic search + topK/category.
 * Does not apply relevance thresholds, custom ranking, or prompt construction.
 */
export async function retrieveRelevantContext(
  input: RetrieveRelevantContextInput,
  deps: RagRetrievalDeps = {},
): Promise<RelevantContextResult> {
  const topK = input.topK ?? MEMORY_SEARCH_DEFAULT_TOP_K;
  const embedQuery = deps.generateQueryEmbedding ?? generateQueryEmbedding;
  const search = deps.searchMemories ?? searchSimilarMemories;

  const embedded = await embedQuery(input.query);
  const queryVector = embedded.vector;

  // pgvector column is fixed-width; reject mismatched query vectors before search.
  if (queryVector.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new MemoryEmbeddingDimensionMismatchError(queryVector.length);
  }

  const hits = await search(queryVector, topK, input.category);

  return {
    query: embedded.query,
    memories: hits.map(toContextMemory),
  };
}

/**
 * Phase 5.2 compatibility wrapper — maps `memories` → `results`.
 * Prefer `retrieveRelevantContext` for new code.
 */
export async function retrieveRelevantMemories(
  query: string,
  topK: number = MEMORY_SEARCH_DEFAULT_TOP_K,
  category?: MemoryCategory,
  deps: RagRetrievalDeps = {},
): Promise<RagRetrievalResult> {
  const result = await retrieveRelevantContext({ query, topK, category }, deps);
  return {
    query: result.query,
    results: result.memories,
  };
}
