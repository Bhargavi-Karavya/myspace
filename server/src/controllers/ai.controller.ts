import { performance } from 'node:perf_hooks';
import type { Request, Response } from 'express';
import {
  ClassificationOutputError,
  ExtractionOutputError,
  generateJsonAnalysis,
  generateMessageClassification,
  generateMessageIntent,
  generateStructuredAnalysis,
  generateStructuredExtraction,
  generateTestMessage,
  getGeminiErrorStatus,
  IntentOutputError,
  isGeminiQuotaOrRateLimitError,
  JsonOutputError,
  MemoryExtractOutputError,
  startMessageStream,
  StructuredOutputError,
} from '../services/gemini.service.js';
import {
  EmbeddingDimensionMismatchError,
  listStoredEmbeddingExperiments,
  searchEmbeddingExperiments,
  storeEmbeddingExperiment,
} from '../services/embedding-experiment.service.js';
import {
  EmbeddingModelUnavailableError,
  EmbeddingOutputError,
  generateTextEmbeddings,
} from '../services/embedding.service.js';
import {
  CosineSimilarityError,
  cosineSimilarity,
} from '../utils/cosine-similarity.js';
import {
  VectorMathError,
  describeVectorStatistics,
} from '../utils/vector-math.js';
import {
  SimilaritySearchError,
  searchSimilarVectors,
} from '../utils/similarity-search.js';
import {
  editMemory,
  extractAndStoreMemories,
  forgetMemory,
  getMemories,
  getMemory,
  MemoryNotFoundError,
} from '../services/memory.service.js';
import {
  generateEmbeddingForMemory,
  MemoryEmbeddingDimensionMismatchError,
  persistEmbeddingForMemory,
  searchMemoriesBySimilarity,
} from '../services/memory-embedding.service.js';
import {
  retrieveRelevantContext,
} from '../services/rag-retrieval.service.js';
import { QueryEmbeddingInputError } from '../services/query-embedding.service.js';
import {
  buildUserRagContextForChat,
  formatRagContextForSystemInstruction,
} from '../services/chat-rag.service.js';
import {
  ConversationNotFoundError,
  createConversation,
  deleteConversation,
  getConversation,
  getConversationWithMessages,
  getRecentConversations,
  persistChatTurn,
  renameConversation,
  toApiMessageRole,
} from '../services/conversation.service.js';
import { getAuthenticatedUserId } from '../middleware/auth.js';
import {
  chatRequestSchema,
  classifyRequestSchema,
  conversationIdParamSchema,
  embeddingExperimentRequestSchema,
  embeddingExperimentSearchRequestSchema,
  embeddingInspectRequestSchema,
  embeddingSearchRequestSchema,
  embeddingSimilarityRequestSchema,
  embeddingTestRequestSchema,
  extractRequestSchema,
  intentRequestSchema,
  jsonRequestSchema,
  listMemoriesQuerySchema,
  memoryExtractRequestSchema,
  memoryIdParamSchema,
  memorySearchRequestSchema,
  patchMemoryRequestSchema,
  ragRetrieveRequestSchema,
  renameConversationRequestSchema,
  structuredRequestSchema,
} from '../validators/ai.validator.js';

const SAFE_AI_UNAVAILABLE_ERROR =
  'AI service is temporarily unavailable. Please try again later.';

function writeSse(response: Response, payload: unknown) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);

  // Push bytes to the client immediately (avoid OS/proxy buffering).
  const flushable = response as Response & { flush?: () => void };
  if (typeof flushable.flush === 'function') {
    flushable.flush();
  }
}

function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function logGeminiTechnicalError(context: string, error: unknown) {
  // Log provider details for debugging only — never log GEMINI_API_KEY / env secrets.
  console.error(context, {
    status: getGeminiErrorStatus(error),
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
  });
}

function sendGeminiHttpError(response: Response, error: unknown) {
  if (isGeminiQuotaOrRateLimitError(error)) {
    response.status(503).json({
      error: SAFE_AI_UNAVAILABLE_ERROR,
    });
    return;
  }

  if (getGeminiErrorStatus(error) === 503) {
    response.setHeader('Retry-After', '5');
    response.status(503).json({
      error:
        'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
      retryAfterSeconds: 5,
    });
    return;
  }

  response.status(500).json({ error: 'Unable to generate a response right now' });
}

export async function getAiTest(_request: Request, response: Response) {
  try {
    const result = await generateTestMessage();

    response.status(200).json({
      message: result.message,
      fromCache: result.fromCache,
    });
  } catch (error) {
    logGeminiTechnicalError('Gemini test request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(502).json({ error: 'Unable to generate an AI response' });
  }
}

/**
 * Phase 4.1 — isolated embedding experiment (does not store vectors or touch memories).
 */
export async function embeddingTestWithAi(
  request: Request,
  response: Response,
) {
  const parsed = embeddingTestRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'texts',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await generateTextEmbeddings(parsed.data.texts);
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/test',
        errorType: error.name,
        textCount: parsed.data.texts.length,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/test',
        errorType: error.name,
        textCount: parsed.data.texts.length,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini embedding request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to generate embeddings right now',
    });
  }
}

/**
 * Phase 4.2 — pairwise cosine similarity of two text embeddings.
 * Similarity is computed mathematically from vectors (not explained by Gemini).
 */
export async function embeddingSimilarityWithAi(
  request: Request,
  response: Response,
) {
  const parsed = embeddingSimilarityRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'texts',
        message: issue.message,
      })),
    });
    return;
  }

  const texts = parsed.data.texts;

  try {
    const { embeddings } = await generateTextEmbeddings(texts);
    const first = embeddings[0]!;
    const second = embeddings[1]!;

    const similarity = cosineSimilarity(first.embedding, second.embedding);

    response.status(200).json({
      texts: [first.text, second.text],
      dimensions: first.dimensions,
      similarity,
    });
  } catch (error) {
    if (error instanceof CosineSimilarityError) {
      console.error('Embedding similarity calculation failed:', {
        endpoint: '/api/ai/embedding/similarity',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to compare embeddings right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/similarity',
        errorType: error.name,
        textCount: texts.length,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/similarity',
        errorType: error.name,
        textCount: texts.length,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini embedding similarity request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to compare embeddings right now',
    });
  }
}

/**
 * Phase 4.3 — inspect one embedding vector + local statistics (no storage).
 */
export async function embeddingInspectWithAi(
  request: Request,
  response: Response,
) {
  const parsed = embeddingInspectRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'text',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const { embeddings } = await generateTextEmbeddings([parsed.data.text]);
    const item = embeddings[0]!;
    const statistics = describeVectorStatistics(item.embedding);

    response.status(200).json({
      text: item.text,
      dimensions: item.embedding.length,
      vector: item.embedding,
      statistics,
    });
  } catch (error) {
    if (error instanceof VectorMathError) {
      console.error('Embedding vector stats failed:', {
        endpoint: '/api/ai/embedding/inspect',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to inspect embedding right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/inspect',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/inspect',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini embedding inspect request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to inspect embedding right now',
    });
  }
}

/**
 * Phase 4.4 — in-memory similarity search (no storage / no pgvector).
 */
export async function embeddingSearchWithAi(
  request: Request,
  response: Response,
) {
  const parsed = embeddingSearchRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
    return;
  }

  const { query, candidates, topK } = parsed.data;

  try {
    const textsToEmbed = [query, ...candidates.map((c) => c.text)];
    const { embeddings } = await generateTextEmbeddings(textsToEmbed);

    const queryEmbedding = embeddings[0]!;
    const searchCandidates = candidates.map((candidate, index) => {
      const item = embeddings[index + 1]!;
      return {
        id: candidate.id,
        text: candidate.text,
        vector: item.embedding,
      };
    });

    const results = searchSimilarVectors(
      queryEmbedding.embedding,
      searchCandidates,
      topK,
    );

    response.status(200).json({
      query,
      results,
    });
  } catch (error) {
    if (error instanceof SimilaritySearchError) {
      console.error('Embedding search ranking failed:', {
        endpoint: '/api/ai/embedding/search',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to search embeddings right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/search',
        errorType: error.name,
        candidateCount: candidates.length,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/search',
        errorType: error.name,
        candidateCount: candidates.length,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini embedding search request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to search embeddings right now',
    });
  }
}

/**
 * Phase 4.5 — store one embedding in the isolated pgvector experiment table.
 */
export async function createEmbeddingExperimentHandler(
  request: Request,
  response: Response,
) {
  const parsed = embeddingExperimentRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'text',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const record = await storeEmbeddingExperiment(parsed.data.text);
    response.status(201).json({
      id: record.id,
      text: record.text,
      dimensions: record.dimensions,
    });
  } catch (error) {
    if (error instanceof EmbeddingDimensionMismatchError) {
      console.error('Embedding experiment dimension mismatch:', {
        endpoint: '/api/ai/embedding/experiment',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to store embedding experiment right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/experiment',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/experiment',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError(
      'Gemini embedding experiment request failed:',
      error,
    );

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Embedding experiment storage failed:', {
      endpoint: '/api/ai/embedding/experiment',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to store embedding experiment right now',
    });
  }
}

/**
 * Phase 4.5 — list stored embedding experiment rows (no vectors in response).
 */
export async function listEmbeddingExperimentsHandler(
  _request: Request,
  response: Response,
) {
  try {
    const items = await listStoredEmbeddingExperiments();
    response.status(200).json({ items });
  } catch (error) {
    console.error('Embedding experiment list failed:', {
      endpoint: '/api/ai/embedding/experiment',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to list embedding experiments right now',
    });
  }
}

/**
 * Phase 4.6 — nearest-neighbor search in PostgreSQL via pgvector cosine distance.
 */
export async function searchEmbeddingExperimentsHandler(
  request: Request,
  response: Response,
) {
  const parsed = embeddingExperimentSearchRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await searchEmbeddingExperiments(
      parsed.data.query,
      parsed.data.topK,
    );
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof EmbeddingDimensionMismatchError) {
      console.error('Embedding experiment search dimension mismatch:', {
        endpoint: '/api/ai/embedding/experiment/search',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to search embedding experiments right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/embedding/experiment/search',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Embedding output failed:', {
        endpoint: '/api/ai/embedding/experiment/search',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to generate embeddings right now',
      });
      return;
    }

    logGeminiTechnicalError(
      'Gemini embedding experiment search request failed:',
      error,
    );

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Embedding experiment search failed:', {
      endpoint: '/api/ai/embedding/experiment/search',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to search embedding experiments right now',
    });
  }
}

/**
 * Task 2.1 — isolated structured-output experiment (does not affect /chat).
 */
export async function structuredWithAi(request: Request, response: Response) {
  const parsed = structuredRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const analysis = await generateStructuredAnalysis(parsed.data.message);
    response.status(200).json(analysis);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      console.error('Structured output validation failed:', {
        message: error.message,
        details: error.causeDetail,
      });
      response.status(500).json({
        error: 'Unable to generate a structured response right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini structured request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to generate a structured response right now',
    });
  }
}

/**
 * Task 2.2 — isolated JSON-output experiment (does not affect /chat or /structured).
 */
export async function jsonWithAi(request: Request, response: Response) {
  const parsed = jsonRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const analysis = await generateJsonAnalysis(parsed.data.message);
    response.status(200).json(analysis);
  } catch (error) {
    if (error instanceof JsonOutputError) {
      if (error.kind === 'parse') {
        console.error('AI JSON parse failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      } else {
        console.error('AI JSON Zod validation failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      }

      response.status(500).json({
        error: 'Unable to generate a JSON response right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini JSON request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to generate a JSON response right now',
    });
  }
}

/**
 * Task 2.4 — isolated structured-extraction experiment
 * (does not affect /chat, /structured, or /json).
 */
export async function extractWithAi(request: Request, response: Response) {
  const parsed = extractRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const extraction = await generateStructuredExtraction(parsed.data.message);
    response.status(200).json(extraction);
  } catch (error) {
    if (error instanceof ExtractionOutputError) {
      if (error.kind === 'parse') {
        console.error('AI extraction JSON parse failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      } else {
        console.error('AI extraction Zod validation failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      }

      response.status(500).json({
        error: 'Unable to extract structured data right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini extraction request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to extract structured data right now',
    });
  }
}

/**
 * Task 2.5 — isolated classification experiment
 * (does not affect /chat, /structured, /json, or /extract).
 */
export async function classifyWithAi(request: Request, response: Response) {
  const parsed = classifyRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const classification = await generateMessageClassification(
      parsed.data.message,
    );
    response.status(200).json(classification);
  } catch (error) {
    if (error instanceof ClassificationOutputError) {
      if (error.kind === 'parse') {
        console.error('AI classification JSON parse failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      } else {
        console.error('AI classification Zod validation failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      }

      response.status(500).json({
        error: 'Unable to classify the message right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini classification request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to classify the message right now',
    });
  }
}

/**
 * Task 2.6 — isolated intent-detection experiment
 * (does not affect /chat, /structured, /json, /extract, or /classify).
 */
export async function intentWithAi(request: Request, response: Response) {
  const parsed = intentRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const intent = await generateMessageIntent(parsed.data.message);
    response.status(200).json(intent);
  } catch (error) {
    if (error instanceof IntentOutputError) {
      if (error.kind === 'parse') {
        console.error('AI intent JSON parse failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      } else {
        console.error('AI intent Zod validation failed:', {
          message: error.message,
          details: error.causeDetail,
        });
      }

      response.status(500).json({
        error: 'Unable to detect intent right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini intent request failed:', error);

    if (isGeminiQuotaOrRateLimitError(error)) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    response.status(500).json({
      error: 'Unable to detect intent right now',
    });
  }
}

/**
 * Task 3.3/3.5 — extract candidate memories and persist non-empty results.
 */
export async function memoryExtractWithAi(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memoryExtractRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'message',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await extractAndStoreMemories(parsed.data.message, userId);
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof MemoryExtractOutputError) {
      // Never log user messages, secrets, or Gemini payload content.
      console.error('AI memory extraction failed:', {
        endpoint: '/api/ai/memory/extract',
        errorType: error.kind,
      });

      response.status(500).json({
        error: 'Unable to extract memories right now',
      });
      return;
    }

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      getGeminiErrorStatus(error) !== undefined
    ) {
      logGeminiTechnicalError('Gemini memory extraction request failed:', error);

      if (isGeminiQuotaOrRateLimitError(error)) {
        response.status(503).json({
          error: SAFE_AI_UNAVAILABLE_ERROR,
        });
        return;
      }

      if (getGeminiErrorStatus(error) === 503) {
        response.status(503).json({
          error:
            'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
          retryAfterSeconds: 5,
        });
        return;
      }

      response.status(500).json({
        error: 'Unable to extract memories right now',
      });
      return;
    }

    // Database or other unexpected failures — never expose SQL/credentials.
    console.error('Memory storage failed:', {
      endpoint: '/api/ai/memory/extract',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to save memories right now',
    });
  }
}

/**
 * Phase 3.10 — list stored memories (optional ?category= filter).
 */
export async function listMemoriesHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = listMemoriesQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'category',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const memories = await getMemories(userId, parsed.data.category);
    response.status(200).json({ memories });
  } catch (error) {
    console.error('Memory list failed:', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: 'Unable to list memories right now',
    });
  }
}

/**
 * Phase 3.10 — get one stored memory by id.
 */
export async function getMemoryHandler(request: Request, response: Response) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memoryIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const memory = await getMemory(parsed.data.id, userId);
    response.status(200).json({ memory });
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      response.status(404).json({
        error: 'Memory not found',
      });
      return;
    }

    console.error('Memory get failed:', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: 'Unable to get memory right now',
    });
  }
}

/**
 * Phase 4.7 — generate an embedding for an existing memory's content (not persisted).
 */
export async function memoryEmbeddingTestHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memoryIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await generateEmbeddingForMemory(parsed.data.id, userId);
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      response.status(404).json({
        error: 'Memory not found',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/memory/:id/embedding/test',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Memory embedding generation failed:', {
        endpoint: '/api/ai/memory/:id/embedding/test',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to generate memory embedding right now',
      });
      return;
    }

    logGeminiTechnicalError('Gemini memory embedding request failed:', error);

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      (error instanceof TypeError &&
        /fetch failed|network|timeout/i.test(error.message))
    ) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Memory embedding test failed:', {
      endpoint: '/api/ai/memory/:id/embedding/test',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to generate memory embedding right now',
    });
  }
}

/**
 * Phase 4.9–4.12 — semantic similarity Top-K search over memories.embedding.
 * Optional `category` is validated by Zod and filtered in PostgreSQL.
 * `topK` becomes SQL LIMIT (default/max from MEMORY_SEARCH_* constants).
 */
export async function searchMemoriesHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memorySearchRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await searchMemoriesBySimilarity(
      parsed.data.query,
      parsed.data.topK,
      { userId, category: parsed.data.category },
    );
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof MemoryEmbeddingDimensionMismatchError) {
      console.error('Memory similarity search dimension mismatch:', {
        endpoint: '/api/ai/memory/search',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to search memories right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/memory/search',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Memory similarity query embedding failed:', {
        endpoint: '/api/ai/memory/search',
        errorType: error.name,
      });
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    logGeminiTechnicalError(
      'Gemini memory similarity search request failed:',
      error,
    );

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      (error instanceof TypeError &&
        /fetch failed|network|timeout/i.test(error.message))
    ) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Memory similarity search failed:', {
      endpoint: '/api/ai/memory/search',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to search memories right now',
    });
  }
}

/**
 * Phase 5.2/5.4 — RAG retrieval pipeline (query → embed → context candidates).
 * Maps internal `memories` to public `results`. Does not generate answers.
 */
export async function ragRetrieveHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = ragRetrieveRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await retrieveRelevantContext({
      query: parsed.data.query,
      userId,
      topK: parsed.data.topK,
      category: parsed.data.category,
    });
    // Public API keeps `results`; service uses `memories` (Phase 5.4).
    response.status(200).json({
      query: result.query,
      results: result.memories,
    });
  } catch (error) {
    if (error instanceof QueryEmbeddingInputError) {
      response.status(400).json({
        error: 'Invalid request',
        details: [{ field: 'query', message: error.message }],
      });
      return;
    }

    if (error instanceof MemoryEmbeddingDimensionMismatchError) {
      console.error('RAG retrieval dimension mismatch:', {
        endpoint: '/api/ai/rag/retrieve',
        errorType: error.name,
      });
      response.status(500).json({
        error: 'Unable to retrieve memories right now',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/rag/retrieve',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('RAG retrieval query embedding failed:', {
        endpoint: '/api/ai/rag/retrieve',
        errorType: error.name,
      });
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    logGeminiTechnicalError('Gemini RAG retrieval request failed:', error);

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      (error instanceof TypeError &&
        /fetch failed|network|timeout/i.test(error.message))
    ) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('RAG retrieval failed:', {
      endpoint: '/api/ai/rag/retrieve',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to retrieve memories right now',
    });
  }
}

/**
 * Phase 4.8 — generate and persist an embedding for an existing memory.
 */
export async function persistMemoryEmbeddingHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memoryIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await persistEmbeddingForMemory(parsed.data.id, userId);
    response.status(200).json(result);
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      response.status(404).json({
        error: 'Memory not found',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable:', {
        endpoint: '/api/ai/memory/:id/embedding',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Memory embedding generation failed:', {
        endpoint: '/api/ai/memory/:id/embedding',
        errorType: error.name,
      });
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    logGeminiTechnicalError(
      'Gemini memory embedding persist request failed:',
      error,
    );

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      (error instanceof TypeError &&
        /fetch failed|network|timeout/i.test(error.message))
    ) {
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Memory embedding persistence failed:', {
      endpoint: '/api/ai/memory/:id/embedding',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to store memory embedding right now',
    });
  }
}

/**
 * Phase 3.10 / 4.13 — edit content, category, and/or importance.
 * Content changes regenerate the embedding before the row is written.
 */
export async function patchMemoryHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const params = memoryIdParamSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: params.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  const body = patchMemoryRequestSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: body.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const memory = await editMemory(params.data.id, body.data, userId);
    response.status(200).json({ memory });
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      response.status(404).json({
        error: 'Memory not found',
      });
      return;
    }

    if (error instanceof EmbeddingModelUnavailableError) {
      console.error('Embedding model unavailable during memory patch:', {
        endpoint: '/api/ai/memory/:id',
        errorType: error.name,
      });
      response.status(503).json({
        error:
          'The configured embedding model is unavailable. Check GEMINI_EMBEDDING_MODEL and try again.',
      });
      return;
    }

    if (error instanceof EmbeddingOutputError) {
      console.error('Memory embedding regeneration failed during patch:', {
        endpoint: '/api/ai/memory/:id',
        errorType: error.name,
      });
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    logGeminiTechnicalError(
      'Gemini memory embedding regeneration during patch failed:',
      error,
    );

    if (
      isGeminiQuotaOrRateLimitError(error) ||
      (error instanceof TypeError &&
        /fetch failed|network|timeout/i.test(error.message))
    ) {
      // Content was not written — old content + old embedding remain consistent.
      response.status(503).json({
        error: SAFE_AI_UNAVAILABLE_ERROR,
      });
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      response.status(503).json({
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
      });
      return;
    }

    console.error('Memory patch failed:', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: 'Unable to update memory right now',
    });
  }
}

/**
 * Phase 3.8 — explicitly forget (permanently delete) a memory by id.
 */
export async function deleteMemory(request: Request, response: Response) {
  const userId = getAuthenticatedUserId(request);
  const parsed = memoryIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    await forgetMemory(parsed.data.id, userId);
    response.status(200).json({
      message: 'Memory deleted successfully',
    });
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      response.status(404).json({
        error: 'Memory not found',
      });
      return;
    }

    console.error('Memory delete failed:', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: 'Unable to delete memory right now',
    });
  }
}

/**
 * List recent conversations for the Conversations screen.
 */
export async function listConversationsHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const startedAt = Date.now();
  try {
    console.info('[conversations] list start', { userId });
    const rows = await getRecentConversations(userId, 50);
    console.info('[conversations] list ok', {
      userId,
      count: rows.length,
      ms: Date.now() - startedAt,
    });
    response.status(200).json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title ?? 'Untitled conversation',
        preview: row.preview ?? '',
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List conversations failed:', {
      errorType: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startedAt,
    });
    response.status(500).json({
      error: 'Unable to load conversations right now',
    });
  }
}

/**
 * Create an empty conversation owned by the authenticated user.
 */
export async function createConversationHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  try {
    const conversation = await createConversation({ userId });
    response.status(201).json({
      id: conversation.id,
      title: conversation.title ?? 'Untitled conversation',
      updatedAt: conversation.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Create conversation failed:', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to create conversation right now',
    });
  }
}

/**
 * Load one conversation with messages for restoring the chat thread.
 */
export async function getConversationHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = conversationIdParamSchema.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const { conversation, messages } = await getConversationWithMessages(
      parsed.data.id,
      userId,
    );
    response.status(200).json({
      id: conversation.id,
      title: conversation.title ?? 'Untitled conversation',
      updatedAt: conversation.updatedAt.toISOString(),
      messages: messages.map((message) => ({
        id: message.id,
        role: toApiMessageRole(message.role),
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      response.status(404).json({ error: 'Conversation not found' });
      return;
    }

    console.error('Get conversation failed:', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to load conversation right now',
    });
  }
}

/**
 * Permanently delete a conversation owned by the authenticated user.
 */
export async function deleteConversationHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const parsed = conversationIdParamSchema.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    await deleteConversation(parsed.data.id, userId);
    response.status(200).json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      response.status(404).json({ error: 'Conversation not found' });
      return;
    }

    console.error('Delete conversation failed:', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    response.status(500).json({
      error: 'Unable to delete conversation right now',
    });
  }
}

/**
 * Rename a conversation owned by the authenticated user.
 */
export async function renameConversationHandler(
  request: Request,
  response: Response,
) {
  const userId = getAuthenticatedUserId(request);
  const params = conversationIdParamSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: params.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'id',
        message: issue.message,
      })),
    });
    return;
  }

  const body = renameConversationRequestSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: body.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'title',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const conversation = await renameConversation(
      params.data.id,
      userId,
      body.data.title,
    );
    response.status(200).json({
      id: conversation.id,
      title: conversation.title ?? 'Untitled conversation',
      updatedAt: conversation.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      response.status(404).json({ error: 'Conversation not found' });
      return;
    }

    console.error('Rename conversation failed:', {
      errorType: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : String(error),
    });
    response.status(500).json({
      error: 'Unable to rename conversation right now',
    });
  }
}

export async function chatWithAi(request: Request, response: Response) {
  const userId = getAuthenticatedUserId(request);
  const parsed = chatRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'messages',
        message: issue.message,
      })),
    });
    return;
  }

  const lastUserMessage = [...parsed.data.messages]
    .reverse()
    .find((message) => message.role === 'user');

  if (!lastUserMessage) {
    response.status(400).json({
      error: 'Invalid request',
      details: [
        {
          field: 'messages',
          message: 'At least one user message is required',
        },
      ],
    });
    return;
  }

  if (parsed.data.conversationId) {
    try {
      await getConversation(parsed.data.conversationId, userId);
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        response.status(404).json({ error: 'Conversation not found' });
        return;
      }
      throw error;
    }
  }

  const requestStartedAt = performance.now();
  console.log('AI request started');

  let clientDisconnected = false;
  const onResponseClose = () => {
    // Only treat as disconnect if the client dropped before we finished writing.
    if (!response.writableEnded) {
      clientDisconnected = true;
    }
  };
  response.on('close', onResponseClose);

  let ragSystemInstructionExtra = '';
  try {
    const ragContext = await buildUserRagContextForChat({
      query: lastUserMessage.content,
      userId,
    });
    ragSystemInstructionExtra =
      formatRagContextForSystemInstruction(ragContext);
  } catch (ragError) {
    console.error('Chat RAG context failed; continuing without memories:', {
      errorType: ragError instanceof Error ? ragError.name : 'unknown',
      message:
        ragError instanceof Error ? ragError.message : String(ragError),
    });
  }

  let stream: Awaited<ReturnType<typeof startMessageStream>>;

  try {
    console.log('AI Gemini request started');
    stream = await startMessageStream(parsed.data.messages, {
      systemInstructionExtra: ragSystemInstructionExtra,
    });
  } catch (error) {
    response.off('close', onResponseClose);
    console.log(
      `AI request failed before first chunk: ${elapsedMs(requestStartedAt)} ms`,
    );
    logGeminiTechnicalError('Gemini chat stream failed to start:', error);
    sendGeminiHttpError(response, error);
    return;
  }

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  // Helps some clients/proxies treat this as a live stream.
  response.setHeader('Transfer-Encoding', 'chunked');
  response.flushHeaders();
  response.socket?.setNoDelay(true);

  let chunkCount = 0;
  let charCount = 0;
  let assistantText = '';
  let firstChunkLogged = false;
  let conversationId = parsed.data.conversationId;
  let persistedSuccessfully = false;

  try {
    for await (const chunk of stream) {
      if (clientDisconnected) {
        break;
      }

      const text = chunk.text;
      if (!text) {
        continue;
      }

      if (!firstChunkLogged) {
        firstChunkLogged = true;
        console.log(
          `AI time to first chunk: ${elapsedMs(requestStartedAt)} ms`,
        );
      }

      chunkCount += 1;
      charCount += text.length;
      assistantText += text;
      writeSse(response, { text });
    }

    // Persist even if the client navigated away mid-stream — as long as we
    // have a complete-enough assistant reply, Recent Chats should still update.
    if (assistantText.trim() && lastUserMessage.content.trim()) {
      try {
        const persisted = await persistChatTurn({
          userId,
          conversationId,
          userContent: lastUserMessage.content,
          assistantContent: assistantText,
        });
        conversationId = persisted.conversationId;
        persistedSuccessfully = true;
        if (!response.writableEnded && !clientDisconnected) {
          writeSse(response, { conversationId });
        }
      } catch (persistError) {
        console.error('Chat persistence failed:', {
          errorType:
            persistError instanceof Error ? persistError.name : 'unknown',
          message:
            persistError instanceof Error
              ? persistError.message
              : String(persistError),
        });
        // Do not fail the chat reply if persistence fails.
      }
    }

    if (!response.writableEnded) {
      if (!clientDisconnected) {
        writeSse(response, { done: true });
      }
      response.end();
    }

    // Fire-and-forget memory extraction after SSE done — never blocks chat.
    if (persistedSuccessfully && lastUserMessage.content.trim()) {
      void extractAndStoreMemories(lastUserMessage.content, userId).catch(
        (extractError) => {
          console.error('Background memory extraction failed:', {
            errorType:
              extractError instanceof Error ? extractError.name : 'unknown',
            message:
              extractError instanceof Error
                ? extractError.message
                : String(extractError),
          });
        },
      );
    }

    console.log(
      `AI total response time: ${elapsedMs(requestStartedAt)} ms`,
    );
    console.log(
      clientDisconnected
        ? `Gemini chat stream closed by client: ${chunkCount} chunk(s), ${charCount} char(s)`
        : `Gemini chat stream complete: ${chunkCount} chunk(s), ${charCount} char(s)`,
    );
  } catch (error) {
    logGeminiTechnicalError('Gemini chat stream failed mid-response:', error);

    try {
      if (!firstChunkLogged) {
        console.log(
          `AI request failed before first chunk: ${elapsedMs(requestStartedAt)} ms`,
        );
      } else {
        console.log(
          `AI total response time: ${elapsedMs(requestStartedAt)} ms`,
        );
      }
    } catch {
      // Timing/logging must never break existing error handling.
    }

    if (response.writableEnded) {
      return;
    }

    // If Gemini failed after streaming some tokens, still save the partial
    // turn so Recent Chats updates (same idea as the 503 partial path).
    const shouldPersistPartial =
      Boolean(assistantText.trim()) && Boolean(lastUserMessage.content.trim());

    if (shouldPersistPartial) {
      try {
        const persisted = await persistChatTurn({
          userId,
          conversationId,
          userContent: lastUserMessage.content,
          assistantContent: assistantText,
        });
        conversationId = persisted.conversationId;
        persistedSuccessfully = true;
        writeSse(response, { conversationId: persisted.conversationId });
        void extractAndStoreMemories(lastUserMessage.content, userId).catch(
          (extractError) => {
            console.error('Background memory extraction failed:', {
              errorType:
                extractError instanceof Error ? extractError.name : 'unknown',
              message:
                extractError instanceof Error
                  ? extractError.message
                  : String(extractError),
            });
          },
        );
      } catch (persistError) {
        console.error('Chat persistence failed after partial reply:', {
          errorType:
            persistError instanceof Error ? persistError.name : 'unknown',
          message:
            persistError instanceof Error
              ? persistError.message
              : String(persistError),
        });
      }
    }

    // Quota / rate-limit after headers were sent: stay on SSE, never send JSON.
    if (isGeminiQuotaOrRateLimitError(error)) {
      writeSse(response, { error: SAFE_AI_UNAVAILABLE_ERROR });
      response.end();
      return;
    }

    // Capacity spike after some tokens: keep the partial reply as a finished turn.
    if (getGeminiErrorStatus(error) === 503 && charCount > 0) {
      console.warn(
        `Gemini 503 mid-stream after ${charCount} char(s); finishing with partial reply`,
      );
      writeSse(response, { done: true });
      response.end();
      return;
    }

    if (getGeminiErrorStatus(error) === 503) {
      writeSse(response, {
        error:
          'Gemini is busy right now (high demand). Your request is fine — please try again in a few seconds.',
        retryAfterSeconds: 5,
        status: 503,
      });
      response.end();
      return;
    }

    // Partial text already saved above — finish cleanly so the client keeps it.
    if (shouldPersistPartial && persistedSuccessfully) {
      writeSse(response, { done: true });
      response.end();
      return;
    }

    writeSse(response, {
      error: 'Unable to generate a response right now',
    });
    response.end();
  } finally {
    response.off('close', onResponseClose);
  }
}
