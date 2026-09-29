import { z } from 'zod';

/**
 * Shared memory category definition (Task 3.4).
 * Single source of truth for extraction validation, future memory APIs,
 * and future database schema — do not duplicate these strings elsewhere.
 */
export const MEMORY_CATEGORIES = [
  'preference',
  'professional',
  'personal',
  'goal',
  'other',
] as const;

export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);

/** Inferred from the shared Zod enum — reuse instead of a manual union type. */
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
