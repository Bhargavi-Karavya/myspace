import { z } from 'zod';
import { memoryCategorySchema } from '../memory/categories.js';

export {
  MEMORY_CATEGORIES,
  memoryCategorySchema,
  type MemoryCategory,
} from '../memory/categories.js';

export const memoryCandidateSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1)
    .max(5000, 'Content must be at most 5000 characters'),
  category: memoryCategorySchema,
  /** Future usefulness 0–1 (metadata, not confidence). */
  importance: z.number().min(0).max(1),
});

/**
 * Task 3.3/3.9 — Zod response schema for memory extraction.
 * Category values come from the shared definition in memory/categories.ts.
 */
export const memoryExtractAiResponseSchema = z.object({
  memories: z.array(memoryCandidateSchema),
});

export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
export type MemoryExtractAiResponse = z.infer<
  typeof memoryExtractAiResponseSchema
>;
