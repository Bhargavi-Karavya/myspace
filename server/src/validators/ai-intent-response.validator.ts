import { z } from 'zod';

/** Exact allowed intents for Task 2.6 / 2.7 intent detection. */
export const MESSAGE_INTENTS = [
  'learn',
  'ask',
  'reflect',
  'save_context',
  'retrieve_context',
  'other',
] as const;

export const messageIntentSchema = z.enum(MESSAGE_INTENTS);

/**
 * Task 2.7 — Zod response schema for intent + confidence.
 * Runtime source of truth for POST /api/ai/intent responses.
 * Confidence is a self-reported score (0–1), not proof the intent is correct.
 */
export const intentAiResponseSchema = z.object({
  intent: messageIntentSchema,
  confidence: z.number().min(0).max(1),
});

/** Inferred from the Zod schema — do not duplicate as a manual interface. */
export type MessageIntent = z.infer<typeof messageIntentSchema>;
export type IntentAiResponse = z.infer<typeof intentAiResponseSchema>;
