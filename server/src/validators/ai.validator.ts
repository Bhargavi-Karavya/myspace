import { z } from 'zod';
import { memoryCategorySchema } from '../memory/categories.js';
import {
  MEMORY_SEARCH_DEFAULT_TOP_K,
  MEMORY_SEARCH_MAX_TOP_K,
} from '../embedding/constants.js';

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
  /** Optional existing conversation to append this turn to. */
  conversationId: z.uuid({ error: 'conversationId must be a valid UUID' }).optional(),
});

/** Conversation id route param */
export const conversationIdParamSchema = z.object({
  id: z.uuid({ error: 'Id must be a valid UUID' }),
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

/** Phase 3.10 — list memories query (optional category filter) */
export const listMemoriesQuerySchema = z.object({
  category: memoryCategorySchema.optional(),
});

/** Phase 3.10 — manual memory edit body (at least one field required) */
export const patchMemoryRequestSchema = z
  .object({
    content: z
      .string({ error: 'Content must be a string' })
      .trim()
      .min(1, 'Content is required')
      .max(5000, 'Content must be at most 5000 characters')
      .optional(),
    category: memoryCategorySchema.optional(),
    importance: z
      .number({ error: 'Importance must be a number' })
      .min(0, 'Importance must be at least 0')
      .max(1, 'Importance must be at most 1')
      .optional(),
  })
  .refine(
    (data) =>
      data.content !== undefined ||
      data.category !== undefined ||
      data.importance !== undefined,
    {
      message: 'At least one of content, category, or importance is required',
    },
  );

/** Phase 4.1 — isolated embedding experiment request */
export const embeddingTestRequestSchema = z.object({
  texts: z
    .array(
      z
        .string({ error: 'Each text must be a string' })
        .trim()
        .min(1, 'Each text must be non-empty')
        .max(2000, 'Each text must be at most 2000 characters'),
      { error: 'Texts must be an array' },
    )
    .min(1, 'At least one text is required')
    .max(20, 'At most 20 texts are allowed'),
});

/** Phase 4.2 — pairwise cosine similarity experiment (exactly two texts) */
export const embeddingSimilarityRequestSchema = z.object({
  texts: z
    .array(
      z
        .string({ error: 'Each text must be a string' })
        .trim()
        .min(1, 'Each text must be non-empty')
        .max(2000, 'Each text must be at most 2000 characters'),
      { error: 'Texts must be an array' },
    )
    .length(2, 'Exactly two texts are required'),
});

/** Phase 4.3 — inspect a single text embedding + local vector statistics */
export const embeddingInspectRequestSchema = z.object({
  text: z
    .string({ error: 'Text must be a string' })
    .trim()
    .min(1, 'Text is required')
    .max(2000, 'Text must be at most 2000 characters'),
});

/** Phase 4.4 — in-memory similarity search over candidate texts */
export const embeddingSearchRequestSchema = z.object({
  query: z
    .string({ error: 'Query must be a string' })
    .trim()
    .min(1, 'Query is required')
    .max(2000, 'Query must be at most 2000 characters'),
  candidates: z
    .array(
      z.object({
        id: z
          .string({ error: 'Candidate id must be a string' })
          .trim()
          .min(1, 'Candidate id is required'),
        text: z
          .string({ error: 'Candidate text must be a string' })
          .trim()
          .min(1, 'Candidate text is required')
          .max(2000, 'Candidate text must be at most 2000 characters'),
      }),
      { error: 'Candidates must be an array' },
    )
    .min(1, 'At least one candidate is required')
    .max(50, 'At most 50 candidates are allowed'),
  topK: z
    .number({ error: 'topK must be a number' })
    .int('topK must be an integer')
    .positive('topK must be a positive integer')
    .max(50, 'topK must be at most 50')
    .optional(),
});

/** Phase 4.5 — store one text embedding in the isolated pgvector experiment table */
export const embeddingExperimentRequestSchema = z.object({
  text: z
    .string({ error: 'Text must be a string' })
    .trim()
    .min(1, 'Text is required')
    .max(2000, 'Text must be at most 2000 characters'),
});

/** Phase 4.6 — pgvector nearest-neighbor search over embedding_experiments */
export const embeddingExperimentSearchRequestSchema = z.object({
  query: z
    .string({ error: 'Query must be a string' })
    .trim()
    .min(1, 'Query is required')
    .max(2000, 'Query must be at most 2000 characters'),
  topK: z
    .number({ error: 'topK must be a number' })
    .int('topK must be an integer')
    .positive('topK must be a positive integer')
    .max(50, 'topK must be at most 50')
    .optional()
    .default(5),
});

/** Phase 4.9–4.12 — pgvector similarity search; Top-K limited in PostgreSQL. */
export const memorySearchRequestSchema = z.object({
  query: z
    .string({ error: 'Query must be a string' })
    .trim()
    .min(1, 'Query is required')
    .max(2000, 'Query must be at most 2000 characters'),
  /**
   * How many nearest memories to return (Phase 4.12).
   * Omitted → MEMORY_SEARCH_DEFAULT_TOP_K. Cap → MEMORY_SEARCH_MAX_TOP_K.
   * Must be a JSON number (not a string); applied as SQL LIMIT, not Node slicing.
   */
  topK: z
    .number({ error: 'topK must be a number' })
    .int('topK must be an integer')
    .positive('topK must be a positive integer')
    .max(
      MEMORY_SEARCH_MAX_TOP_K,
      `topK must be at most ${MEMORY_SEARCH_MAX_TOP_K}`,
    )
    .optional()
    .default(MEMORY_SEARCH_DEFAULT_TOP_K),
  /** Optional metadata filter — applied in PostgreSQL before ranking. */
  category: memoryCategorySchema.optional(),
});

/**
 * Phase 5.3 — shared RAG query string (trim + non-empty).
 * Reused by the retrieve request body and the query-embedding service.
 */
export const ragQuerySchema = z
  .string({ error: 'Query must be a string' })
  .trim()
  .min(1, 'Query is required')
  .max(2000, 'Query must be at most 2000 characters');

/**
 * Phase 5.2 — isolated RAG retrieval request.
 * Same query/topK/category shape as memory search; separate schema for the RAG endpoint.
 */
export const ragRetrieveRequestSchema = z.object({
  query: ragQuerySchema,
  topK: z
    .number({ error: 'topK must be a number' })
    .int('topK must be an integer')
    .positive('topK must be a positive integer')
    .max(
      MEMORY_SEARCH_MAX_TOP_K,
      `topK must be at most ${MEMORY_SEARCH_MAX_TOP_K}`,
    )
    .optional()
    .default(MEMORY_SEARCH_DEFAULT_TOP_K),
  /** Optional metadata filter — applied in PostgreSQL before ranking. */
  category: memoryCategorySchema.optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;
export type StructuredRequest = z.infer<typeof structuredRequestSchema>;
export type StructuredAnalysis = z.infer<typeof structuredAnalysisSchema>;
export type JsonRequest = z.infer<typeof jsonRequestSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;
export type IntentRequest = z.infer<typeof intentRequestSchema>;
export type MemoryExtractRequest = z.infer<typeof memoryExtractRequestSchema>;
export type MemoryIdParam = z.infer<typeof memoryIdParamSchema>;
export type ListMemoriesQuery = z.infer<typeof listMemoriesQuerySchema>;
export type PatchMemoryRequest = z.infer<typeof patchMemoryRequestSchema>;
export type EmbeddingTestRequest = z.infer<typeof embeddingTestRequestSchema>;
export type EmbeddingSimilarityRequest = z.infer<
  typeof embeddingSimilarityRequestSchema
>;
export type EmbeddingInspectRequest = z.infer<
  typeof embeddingInspectRequestSchema
>;
export type EmbeddingSearchRequest = z.infer<
  typeof embeddingSearchRequestSchema
>;
export type EmbeddingExperimentRequest = z.infer<
  typeof embeddingExperimentRequestSchema
>;
export type EmbeddingExperimentSearchRequest = z.infer<
  typeof embeddingExperimentSearchRequestSchema
>;
export type MemorySearchRequest = z.infer<typeof memorySearchRequestSchema>;
export type RagRetrieveRequest = z.infer<typeof ragRetrieveRequestSchema>;
