import { z } from 'zod';

/** Exact allowed categories for Task 2.5 classification. */
export const MESSAGE_CATEGORIES = [
  'technical',
  'career',
  'personal',
  'learning',
  'other',
] as const;

export const messageCategorySchema = z.enum(MESSAGE_CATEGORIES);

/**
 * Task 2.5 — dedicated Zod response schema for message classification.
 * Runtime source of truth for POST /api/ai/classify responses.
 */
export const classifyAiResponseSchema = z.object({
  category: messageCategorySchema,
});

/** Inferred from the Zod schema — do not duplicate as a manual interface. */
export type MessageCategory = z.infer<typeof messageCategorySchema>;
export type ClassifyAiResponse = z.infer<typeof classifyAiResponseSchema>;
