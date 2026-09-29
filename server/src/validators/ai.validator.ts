import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'model'], {
    error: 'Role must be either "user" or "model"',
  }),
  content: z
    .string({ error: 'Content must be a string' })
    .trim()
    .min(1, 'Content is required')
    .max(5000, 'Content must be at most 5000 characters'),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema, {
      error: 'Messages must be an array',
    })
    .min(1, 'At least one message is required'),
});

/** Task 2.1 — structured-output experiment request */
export const structuredRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Task 2.1 — expected Gemini structured JSON shape */
export const structuredAnalysisSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  needsFollowUp: z.boolean(),
});

/** Task 2.2 — JSON-output experiment request */
export const jsonRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Task 2.4 — structured-extraction experiment request */
export const extractRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Task 2.5 — classification experiment request */
export const classifyRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Task 2.6 — intent-detection experiment request */
export const intentRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Task 3.3 — memory-extraction experiment request */
export const memoryExtractRequestSchema = z.object({
  message: z
    .string({ error: 'Message must be a string' })
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters'),
});

/** Phase 3.8 — memory id route param */
export const memoryIdParamSchema = z.object({
  id: z.uuid({ error: 'Id must be a valid UUID' }),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type StructuredRequest = z.infer<typeof structuredRequestSchema>;
export type StructuredAnalysis = z.infer<typeof structuredAnalysisSchema>;
export type JsonRequest = z.infer<typeof jsonRequestSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;
export type IntentRequest = z.infer<typeof intentRequestSchema>;
export type MemoryExtractRequest = z.infer<typeof memoryExtractRequestSchema>;
export type MemoryIdParam = z.infer<typeof memoryIdParamSchema>;
