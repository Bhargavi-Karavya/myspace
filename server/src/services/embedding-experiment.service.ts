import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../embedding/constants.js';
import {
  createEmbeddingExperiment,
  deleteEmbeddingExperiment,
  getEmbeddingExperimentById,
  listEmbeddingExperiments,
  searchSimilarEmbeddings,
  type EmbeddingExperimentRecord,
  type EmbeddingExperimentSearchHit,
  EmbeddingDimensionMismatchError,
} from '../repositories/embedding-experiment.repository.js';
import { generateTextEmbeddings } from './embedding.service.js';

export { EmbeddingDimensionMismatchError };

const DEFAULT_SEARCH_TOP_K = 5;

/**
 * Phase 4.5 — embed text and store it in the isolated pgvector experiment table.
 */
export async function storeEmbeddingExperiment(
  text: string,
): Promise<EmbeddingExperimentRecord> {
  const { embeddings } = await generateTextEmbeddings([text]);
  const item = embeddings[0]!;

  if (item.embedding.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new EmbeddingDimensionMismatchError(item.embedding.length);
  }

  return createEmbeddingExperiment({
    text: item.text,
    embedding: item.embedding,
  });
}

export async function getStoredEmbeddingExperiment(
  id: string,
): Promise<EmbeddingExperimentRecord | null> {
  return getEmbeddingExperimentById(id);
}

export async function listStoredEmbeddingExperiments(): Promise<
  EmbeddingExperimentRecord[]
> {
  return listEmbeddingExperiments();
}

export async function removeEmbeddingExperiment(id: string): Promise<boolean> {
  return deleteEmbeddingExperiment(id);
}

/**
 * Phase 4.6 — embed a query and search nearest rows in PostgreSQL via pgvector.
 */
export async function searchEmbeddingExperiments(
  query: string,
  topK: number = DEFAULT_SEARCH_TOP_K,
): Promise<{ query: string; results: EmbeddingExperimentSearchHit[] }> {
  const { embeddings } = await generateTextEmbeddings([query]);
  const queryVector = embeddings[0]!.embedding;

  if (queryVector.length !== EMBEDDING_EXPERIMENT_DIMENSIONS) {
    throw new EmbeddingDimensionMismatchError(queryVector.length);
  }

  const results = await searchSimilarEmbeddings(queryVector, topK);
  return { query, results };
}
