/**
 * Phase 4.5 — isolated embedding ↔ pgvector experiment.
 * Dimension must match gemini-embedding-001 output and the vector(N) column.
 */
export const EMBEDDING_EXPERIMENT_DIMENSIONS = 3072 as const;

/**
 * Phase 4.12 — Top-K retrieval for memory semantic search.
 *
 * PostgreSQL applies `LIMIT topK` after cosine-distance ranking. The API never
 * loads all rows and slices in Node.js. No relevance threshold in this phase.
 */
export const MEMORY_SEARCH_DEFAULT_TOP_K = 5 as const;
export const MEMORY_SEARCH_MAX_TOP_K = 50 as const;
