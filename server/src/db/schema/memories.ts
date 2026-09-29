import {
  check,
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { MEMORY_CATEGORIES } from '../../memory/categories.js';

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
    content: text('content').notNull(),
    category: memoryCategoryEnum('category').notNull(),
    /** Long-term usefulness metadata (0–1). Not a confidence/truth score. */
    importance: doublePrecision('importance').notNull().default(0.5),
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
  ],
);

export type MemoryRow = typeof memories.$inferSelect;
export type NewMemoryRow = typeof memories.$inferInsert;
