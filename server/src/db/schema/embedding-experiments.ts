import { pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../../embedding/constants.js';

/**
 * Phase 4.5 — isolated pgvector storage experiment.
 * Not connected to the memories table or memory retrieval.
 */
export const embeddingExperiments = pgTable('embedding_experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  text: text('text').notNull(),
  embedding: vector('embedding', {
    dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
  }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type EmbeddingExperimentRow = typeof embeddingExperiments.$inferSelect;
export type NewEmbeddingExperimentRow =
  typeof embeddingExperiments.$inferInsert;
