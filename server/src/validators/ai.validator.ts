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

/** Task 2.2 — expected Gemini JSON shape */
export const jsonAnalysisSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type StructuredRequest = z.infer<typeof structuredRequestSchema>;
export type StructuredAnalysis = z.infer<typeof structuredAnalysisSchema>;
export type JsonRequest = z.infer<typeof jsonRequestSchema>;
export type JsonAnalysis = z.infer<typeof jsonAnalysisSchema>;
