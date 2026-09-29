import { z } from 'zod';

/**
 * Task 2.3 — dedicated Zod response schema for AI-generated JSON.
 * This is the runtime source of truth for POST /api/ai/json responses.
 * Kept separate from request validation (`jsonRequestSchema`).
 */
export const jsonAiResponseSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

/** Inferred from the Zod schema — do not duplicate as a manual interface. */
export type JsonAiResponse = z.infer<typeof jsonAiResponseSchema>;
