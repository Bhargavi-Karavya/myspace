import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, type Content, type Schema } from '@google/genai';
import { env } from '../config/env.js';
import {
  jsonAnalysisSchema,
  structuredAnalysisSchema,
  type ChatMessage,
  type JsonAnalysis,
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
 * Task 2.2 experiment: ask Gemini for JSON via responseMimeType only
 * (no responseSchema), then parse + Zod-validate before returning.
 */
export async function generateJsonAnalysis(
  message: string,
): Promise<JsonAnalysis> {
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
    throw new JsonOutputError('Gemini returned an empty JSON response');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.text) as unknown;
  } catch (error) {
    throw new JsonOutputError('Gemini returned non-JSON output', error);
  }

  const validated = jsonAnalysisSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new JsonOutputError(
      'Gemini JSON output failed Zod validation',
      validated.error,
    );
  }

  return validated.data;
}

export class JsonOutputError extends Error {
  readonly causeDetail: unknown;

  constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'JsonOutputError';
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
