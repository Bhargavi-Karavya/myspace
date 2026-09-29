import { z } from 'zod';

/**
 * Task 2.4 — dedicated Zod response schema for structured extraction.
 * Runtime source of truth for POST /api/ai/extract responses.
 */
export const extractAiResponseSchema = z.object({
  facts: z.array(z.string()),
  topics: z.array(z.string()),
});

/** Inferred from the Zod schema — do not duplicate as a manual interface. */
export type ExtractAiResponse = z.infer<typeof extractAiResponseSchema>;
