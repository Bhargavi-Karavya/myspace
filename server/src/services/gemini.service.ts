import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, type Content, type Schema } from '@google/genai';
import { env } from '../config/env.js';
import {
  classifyAiResponseSchema,
  MESSAGE_CATEGORIES,
  type ClassifyAiResponse,
} from '../validators/ai-classify-response.validator.js';
import {
  extractAiResponseSchema,
  type ExtractAiResponse,
} from '../validators/ai-extract-response.validator.js';
import {
  intentAiResponseSchema,
  MESSAGE_INTENTS,
  type IntentAiResponse,
} from '../validators/ai-intent-response.validator.js';
import {
  memoryExtractAiResponseSchema,
  type MemoryExtractAiResponse,
} from '../validators/ai-memory-extract-response.validator.js';
import { MEMORY_CATEGORIES } from '../memory/categories.js';
import {
  jsonAiResponseSchema,
  type JsonAiResponse,
} from '../validators/ai-json-response.validator.js';
import {
  structuredAnalysisSchema,
  type ChatMessage,
  type StructuredAnalysis,
} from '../validators/ai.validator.js';

const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const systemInstruction =
  'You are an AI assistant for a project called MySpace. In this conversation, MySpace always means this project: a personal context and reflection assistant, not the historical MySpace social networking website. Help users think out loud, organize thoughts, and work with useful personal context. When asked to explain what MySpace is, describe this project and never the historical social networking website. Do not diagnose mental-health conditions or provide medical or psychological diagnoses.';

/** Gemini responseSchema for the Task 2.1 structured-output experiment. */
export const structuredAnalysisGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: {
      type: Type.STRING,
      description: 'Short topic label for the user message',
    },
    summary: {
      type: Type.STRING,
      description: 'One or two sentence summary of the user message',
    },
    needsFollowUp: {
      type: Type.BOOLEAN,
      description:
        'True if clarifying questions would help understand the user better',
    },
  },
  required: ['topic', 'summary', 'needsFollowUp'],
  propertyOrdering: ['topic', 'summary', 'needsFollowUp'],
};

/** Gemini responseSchema for the Task 2.4 structured-extraction experiment. */
export const extractAiGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    facts: {
      type: Type.ARRAY,
      description:
        'Concise factual statements explicitly supported by the user message. Do not invent facts.',
      items: { type: Type.STRING },
    },
    topics: {
      type: Type.ARRAY,
      description:
        'Main topics explicitly mentioned or clearly represented in the user message.',
      items: { type: Type.STRING },
    },
  },
  required: ['facts', 'topics'],
  propertyOrdering: ['facts', 'topics'],
};

/** Gemini responseSchema for the Task 2.5 classification experiment. */
export const classifyAiGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      format: 'enum',
      enum: [...MESSAGE_CATEGORIES],
      description:
        'Exactly one allowed category for the user message. Do not invent new categories.',
    },
  },
  required: ['category'],
  propertyOrdering: ['category'],
};

/** Gemini responseSchema for the Task 2.6/2.7 intent-detection experiment. */
export const intentAiGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      format: 'enum',
      enum: [...MESSAGE_INTENTS],
      description:
        'Exactly one allowed intent for the user message. Do not invent new intents. save_context and retrieve_context are labels only — do not perform saving or retrieval.',
    },
    confidence: {
      type: Type.NUMBER,
      description:
        'Self-reported confidence that the selected intent is the best match, from 0 (uncertain) to 1 (very confident). Not a guarantee of correctness.',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['intent', 'confidence'],
  propertyOrdering: ['intent', 'confidence'],
};

/** Gemini responseSchema for the Task 3.3/3.9 memory-extraction experiment. */
export const memoryExtractAiGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    memories: {
      type: Type.ARRAY,
      description:
        'Zero or more candidate long-term memories explicitly supported by the user message. Empty if none.',
      items: {
        type: Type.OBJECT,
        properties: {
          content: {
            type: Type.STRING,
            description:
              'Concise memory statement explicitly supported by the user message. Do not invent facts.',
          },
          category: {
            type: Type.STRING,
            format: 'enum',
            enum: [...MEMORY_CATEGORIES],
            description: 'Exactly one allowed memory category.',
          },
          importance: {
            type: Type.NUMBER,
            minimum: 0,
            maximum: 1,
            description:
              'How useful this memory is likely to be across future conversations (0 = very low, 1 = very high). Not a confidence or truth score.',
          },
        },
        required: ['content', 'category', 'importance'],
        propertyOrdering: ['content', 'category', 'importance'],
      },
    },
  },
  required: ['memories'],
  propertyOrdering: ['memories'],
};

const MAX_CACHE_ENTRIES = 100;
const responseCache = new Map<string, string>();

const cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.cache');
const cacheFilePath = path.join(cacheDir, 'gemini-chat-cache.json');

function loadPersistedCache() {
  try {
    const raw = readFileSync(cacheFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return;

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        responseCache.set(key, value);
      }
    }
  } catch {
    // Missing/invalid cache file is fine on first run.
  }
}

function persistCache() {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      cacheFilePath,
      JSON.stringify(Object.fromEntries(responseCache), null, 2),
      'utf8',
    );
  } catch (error) {
    console.error('Failed to persist Gemini response cache:', error);
  }
}

loadPersistedCache();

function buildCacheKey(messages: ChatMessage[]) {
  return JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
  );
}

function getCachedResponse(key: string) {
  return responseCache.get(key);
}

function setCachedResponse(key: string, value: string) {
  if (responseCache.has(key)) {
    responseCache.delete(key);
  }
  responseCache.set(key, value);

  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }

  persistCache();
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));
}

export type GenerateMessageResult = {
  message: string;
  fromCache: boolean;
};

export async function generateMessage(
  messages: ChatMessage[],
): Promise<GenerateMessageResult> {
  const cacheKey = buildCacheKey(messages);
  const cached = getCachedResponse(cacheKey);

  if (cached) {
    return { message: cached, fromCache: true };
  }

  const text = await generateContentWithRetry(messages);
  setCachedResponse(cacheKey, text);
  return { message: text, fromCache: false };
}

/**
 * Starts a Gemini streaming response using @google/genai generateContentStream.
 * Errors thrown here happen before any chunks are produced.
 * Retries a few times on temporary 503 capacity spikes.
 */
export async function startMessageStream(messages: ChatMessage[]) {
  const maxAttempts = 5;
  let lastError: unknown;
  const contents = toGeminiContents(messages);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await gemini.models.generateContentStream({
        model: env.GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
        },
      });
    } catch (error) {
      lastError = error;
      const status = getGeminiErrorStatus(error);

      if (status === 503 && attempt < maxAttempts) {
        const delayMs = Math.min(8000, attempt * 1500);
        console.warn(
          `Gemini stream unavailable (503). Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})...`,
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to generate a response right now');
}

async function generateContentWithRetry(messages: ChatMessage[]) {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await gemini.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: toGeminiContents(messages),
        config: {
          systemInstruction,
        },
      });

      if (!response.text) {
        throw new Error('Gemini returned an empty response');
      }

      return response.text;
    } catch (error) {
      lastError = error;
      const status = getGeminiErrorStatus(error);

      // 503 = temporary Google capacity spike; retry a couple times.
      if (status === 503 && attempt < maxAttempts) {
        const delayMs = attempt * 1200;
        console.warn(
          `Gemini temporarily unavailable (503). Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})...`,
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to generate a response right now');
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function generateTestMessage() {
  return generateMessage([
    {
      role: 'user',
      content: 'Explain what MySpace is in one simple sentence.',
    },
  ]);
}

/**
 * Task 2.1 experiment: ask Gemini for predictable JSON via responseSchema,
 * then validate with Zod before returning.
 */
export async function generateStructuredAnalysis(
  message: string,
): Promise<StructuredAnalysis> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction:
        'Analyze the user message for a personal context assistant. Return only JSON matching the provided schema. Do not diagnose medical or psychological conditions.',
      responseMimeType: 'application/json',
      responseSchema: structuredAnalysisGeminiSchema,
    },
  });

  if (!response.text) {
    throw new StructuredOutputError('Gemini returned an empty structured response');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text) as unknown;
  } catch (error) {
    throw new StructuredOutputError(
      'Gemini returned non-JSON structured output',
      error,
    );
  }

  const validated = structuredAnalysisSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new StructuredOutputError(
      'Gemini structured output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class StructuredOutputError extends Error {
  readonly causeDetail: unknown;

  constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'StructuredOutputError';
    this.causeDetail = causeDetail;
  }
}

/**
 * Task 2.2/2.3: ask Gemini for JSON via responseMimeType, then
 * JSON.parse + Zod-validate with jsonAiResponseSchema before returning.
 * Valid JSON alone is never trusted — Zod is the runtime source of truth.
 */
export async function generateJsonAnalysis(
  message: string,
): Promise<JsonAiResponse> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction:
        'Analyze the user message for a personal context assistant. Return JSON only with exactly these fields: "topic" (string), "summary" (string), and "keywords" (array of strings). Do not include markdown, code fences, or any text outside the JSON object. Do not diagnose medical or psychological conditions.',
      responseMimeType: 'application/json',
    },
  });

  if (!response.text) {
    throw new JsonOutputError(
      'parse',
      'Gemini returned an empty JSON response',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    throw new JsonOutputError(
      'parse',
      'Gemini returned non-JSON output',
      error,
    );
  }

  const validated = jsonAiResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new JsonOutputError(
      'validation',
      'Gemini JSON output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class JsonOutputError extends Error {
  readonly kind: 'parse' | 'validation';
  readonly causeDetail: unknown;

  constructor(
    kind: 'parse' | 'validation',
    message: string,
    causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'JsonOutputError';
    this.kind = kind;
    this.causeDetail = causeDetail;
  }
}

const EXTRACT_SYSTEM_INSTRUCTION =
  'You extract information from user messages for a personal context assistant called MySpace. Return JSON only. Populate "facts" with concise factual statements that are explicitly supported by the user message. Populate "topics" with the main topics explicitly mentioned or clearly represented in the message. Do not invent facts. Do not provide advice, recommendations, analysis, diagnosis, or solutions. Do not diagnose medical or psychological conditions.';

/**
 * Task 2.4 experiment: structured extraction of facts + topics via
 * responseSchema, then JSON.parse + Zod validation before returning.
 */
export async function generateStructuredExtraction(
  message: string,
): Promise<ExtractAiResponse> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction: EXTRACT_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: extractAiGeminiSchema,
    },
  });

  if (!response.text) {
    throw new ExtractionOutputError(
      'parse',
      'Gemini returned an empty extraction response',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    throw new ExtractionOutputError(
      'parse',
      'Gemini returned non-JSON extraction output',
      error,
    );
  }

  const validated = extractAiResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new ExtractionOutputError(
      'validation',
      'Gemini extraction output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class ExtractionOutputError extends Error {
  readonly kind: 'parse' | 'validation';
  readonly causeDetail: unknown;

  constructor(
    kind: 'parse' | 'validation',
    message: string,
    causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'ExtractionOutputError';
    this.kind = kind;
    this.causeDetail = causeDetail;
  }
}

const CLASSIFY_SYSTEM_INSTRUCTION = `You classify user messages for a personal context assistant called MySpace. Return JSON only with a single field "category". Choose exactly ONE of these allowed categories: ${MESSAGE_CATEGORIES.join(', ')}. Do not invent new categories. Do not return multiple categories. Do not provide explanations, advice, or diagnosis. Base the classification only on the user's message.`;

/**
 * Task 2.5 experiment: classify a message into exactly one allowed category
 * via responseSchema, then JSON.parse + Zod validation before returning.
 */
export async function generateMessageClassification(
  message: string,
): Promise<ClassifyAiResponse> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction: CLASSIFY_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: classifyAiGeminiSchema,
    },
  });

  if (!response.text) {
    throw new ClassificationOutputError(
      'parse',
      'Gemini returned an empty classification response',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    throw new ClassificationOutputError(
      'parse',
      'Gemini returned non-JSON classification output',
      error,
    );
  }

  const validated = classifyAiResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new ClassificationOutputError(
      'validation',
      'Gemini classification output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class ClassificationOutputError extends Error {
  readonly kind: 'parse' | 'validation';
  readonly causeDetail: unknown;

  constructor(
    kind: 'parse' | 'validation',
    message: string,
    causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'ClassificationOutputError';
    this.kind = kind;
    this.causeDetail = causeDetail;
  }
}

const INTENT_SYSTEM_INSTRUCTION = `You detect the primary intent of user messages for a personal context assistant called MySpace. Return JSON only with fields "intent" and "confidence". Choose exactly ONE of these allowed intents: ${MESSAGE_INTENTS.join(', ')}. Set "confidence" to a number between 0 and 1 inclusive reflecting how sure you are that this intent is the best match (0 = very uncertain, 1 = very confident). Confidence is not proof that the intent is correct. Do not invent new intents. Do not return multiple intents. Do not provide explanations, advice, solutions, or diagnosis. Base the decision only on the user's message. Note: save_context and retrieve_context are experimental labels only — do not actually save or retrieve memory.`;

/**
 * Task 2.6/2.7 experiment: detect exactly one allowed intent with a
 * confidence score via responseSchema, then JSON.parse + Zod validation.
 */
export async function generateMessageIntent(
  message: string,
): Promise<IntentAiResponse> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction: INTENT_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: intentAiGeminiSchema,
    },
  });

  if (!response.text) {
    throw new IntentOutputError(
      'parse',
      'Gemini returned an empty intent response',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    throw new IntentOutputError(
      'parse',
      'Gemini returned non-JSON intent output',
      error,
    );
  }

  const validated = intentAiResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new IntentOutputError(
      'validation',
      'Gemini intent output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class IntentOutputError extends Error {
  readonly kind: 'parse' | 'validation';
  readonly causeDetail: unknown;

  constructor(
    kind: 'parse' | 'validation',
    message: string,
    causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'IntentOutputError';
    this.kind = kind;
    this.causeDetail = causeDetail;
  }
}

const MEMORY_EXTRACT_SYSTEM_INSTRUCTION = `You extract candidate long-term memories from a user message for a personal context assistant called MySpace. Return JSON only with a "memories" array. Each item must have "content" (string), "category" (one of: ${MEMORY_CATEGORIES.join(', ')}), and "importance" (number from 0 to 1 inclusive). Importance measures how useful the information is likely to be across future conversations: 0 = very low long-term usefulness, 1 = very high long-term usefulness. Importance is NOT confidence or proof that the fact is true. Only evaluate information actually supported by the user message. Include only information that could be useful as long-term personal context. Return {"memories":[]} if nothing useful. Do not invent facts, preferences, goals, or personal information. Do not infer sensitive personal attributes. Skip temporary conversational details unless they have clear long-term usefulness. Do not give advice or explanations. Do not store or retrieve anything — candidates only.`;

/**
 * Task 3.3 experiment: extract candidate long-term memories (not persisted)
 * via responseSchema, then JSON.parse + Zod validation before returning.
 */
export async function generateMemoryExtraction(
  message: string,
): Promise<MemoryExtractAiResponse> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: message,
    config: {
      systemInstruction: MEMORY_EXTRACT_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: memoryExtractAiGeminiSchema,
    },
  });

  if (!response.text) {
    throw new MemoryExtractOutputError(
      'parse',
      'Gemini returned an empty memory extraction response',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    throw new MemoryExtractOutputError(
      'parse',
      'Gemini returned non-JSON memory extraction output',
      error,
    );
  }

  const validated = memoryExtractAiResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new MemoryExtractOutputError(
      'validation',
      'Gemini memory extraction output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class MemoryExtractOutputError extends Error {
  readonly kind: 'parse' | 'validation';
  readonly causeDetail: unknown;

  constructor(
    kind: 'parse' | 'validation',
    message: string,
    causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'MemoryExtractOutputError';
    this.kind = kind;
    this.causeDetail = causeDetail;
  }
}

export function getGeminiErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  return undefined;
}

export function getGeminiErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}

/**
 * Detects Gemini quota / rate-limit failures (HTTP 429 and RESOURCE_EXHAUSTED).
 */
export function isGeminiQuotaOrRateLimitError(error: unknown): boolean {
  if (getGeminiErrorStatus(error) === 429) {
    return true;
  }

  const message = getGeminiErrorMessage(error);
  if (/RESOURCE_EXHAUSTED/i.test(message)) {
    return true;
  }

  // Nested Google error payloads sometimes put the code in the message body.
  if (/"code"\s*:\s*429\b/.test(message)) {
    return true;
  }

  return false;
}

export function getGeminiRetryAfterSeconds(error: unknown): number | undefined {
  const message = getGeminiErrorMessage(error);

  const match = message.match(/retry in ([\d.]+)s/i);
  if (!match?.[1]) {
    return undefined;
  }

  return Math.max(1, Math.ceil(Number(match[1])));
}
