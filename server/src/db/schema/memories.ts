import {
  check,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { MEMORY_CATEGORIES } from '../../memory/categories.js';
import { EMBEDDING_EXPERIMENT_DIMENSIONS } from '../../embedding/constants.js';

/**
 * PostgreSQL enum backed by the shared MEMORY_CATEGORIES definition (Phase 3.4/3.5).
 * Do not duplicate category string literals here.
 */
export const memoryCategoryEnum = pgEnum(
  'memory_category',
  MEMORY_CATEGORIES as unknown as [string, ...string[]],
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /**
     * Neon Auth user id (Better Auth `user.id` / JWT `sub`).
     * Opaque text — not assumed UUID. Nullable so pre-ownership legacy rows
     * remain intact and are excluded from user-scoped queries.
     * No FK: Neon Auth identities live in managed `neon_auth` (not app Drizzle).
     */
    userId: text('user_id'),
    content: text('content').notNull(),
    category: memoryCategoryEnum('category').notNull(),
    /** Long-term usefulness metadata (0–1). Not a confidence/truth score. */
    importance: doublePrecision('importance').notNull().default(0.5),
    /**
     * Phase 4.8 — optional pgvector embedding of `content`.
     * Nullable so pre-embedding rows remain valid.
     */
    embedding: vector('embedding', {
      dimensions: EMBEDDING_EXPERIMENT_DIMENSIONS,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'memories_importance_range',
      sql`${table.importance} >= 0 AND ${table.importance} <= 1`,
    ),
    index('memories_user_id_idx').on(table.userId),
    /**
     * Phase 4.10 — HNSW is an approximate nearest-neighbor (ANN) vector index.
     * It improves similarity-search latency at scale versus exact brute-force
     * scans of every row; it is not identical to an exhaustive ORDER BY scan.
     *
     * pgvector allows at most 2000 dims for HNSW on plain `vector`, but Gemini
     * embeddings here are 3072-d. Index the half-precision cast instead
     * (`halfvec`, up to 4000 dims) with cosine ops — the supported pattern for
     * high-dimensional cosine search. NULL embeddings are not indexed and
     * remain valid on the table.
     *
     * Do not add a second vector index (IVFFlat, etc.) in this phase.
     */
    index('memories_embedding_hnsw_idx').using(
      'hnsw',
      sql`(${table.embedding}::halfvec(${sql.raw(String(EMBEDDING_EXPERIMENT_DIMENSIONS))})) halfvec_cosine_ops`,
    ),
  ],
);

export type MemoryRow = typeof memories.$inferSelect;
export type NewMemoryRow = typeof memories.$inferInsert;
