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

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
