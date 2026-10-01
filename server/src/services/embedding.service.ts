import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import {
  getGeminiErrorMessage,
  getGeminiErrorStatus,
} from './gemini.service.js';

const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export type TextEmbeddingResult = {
  text: string;
  dimensions: number;
  embedding: number[];
};

export type EmbeddingTestResult = {
  embeddings: TextEmbeddingResult[];
};

/**
 * Phase 4.1 — isolated embedding experiment.
 * Generates vectors only; does not store them or touch the memories table.
 */
export async function generateTextEmbeddings(
  texts: string[],
): Promise<EmbeddingTestResult> {
  let response;
  try {
    response = await gemini.models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL,
      contents: texts,
    });
  } catch (error) {
    if (isEmbeddingModelUnavailableError(error)) {
      throw new EmbeddingModelUnavailableError(env.GEMINI_EMBEDDING_MODEL);
    }
    throw error;
  }

  const vectors = response.embeddings;
  if (!vectors || vectors.length === 0) {
    throw new EmbeddingOutputError(
      'Embedding API returned no embedding vectors',
    );
  }

  if (vectors.length !== texts.length) {
    throw new EmbeddingOutputError(
      'Embedding API returned an unexpected number of vectors',
    );
  }

  const embeddings: TextEmbeddingResult[] = [];

  for (let index = 0; index < texts.length; index += 1) {
    const values = vectors[index]?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new EmbeddingOutputError(
        'Embedding API returned an empty or invalid vector',
      );
    }

    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new EmbeddingOutputError(
        'Embedding API returned a non-numeric vector',
      );
    }

    embeddings.push({
      text: texts[index]!,
      dimensions: values.length,
      embedding: values,
    });
  }

  return { embeddings };
}

export class EmbeddingOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingOutputError';
  }
}

export class EmbeddingModelUnavailableError extends Error {
  readonly model: string;

  constructor(model: string) {
    super('Configured embedding model is unavailable');
    this.name = 'EmbeddingModelUnavailableError';
    this.model = model;
  }
}

function isEmbeddingModelUnavailableError(error: unknown): boolean {
  const status = getGeminiErrorStatus(error);
  if (status === 404) {
    return true;
  }

  const message = getGeminiErrorMessage(error);
  return (
    /not found|NOT_FOUND|is not supported|unsupported model|does not support/i.test(
      message,
    ) && /embed|model/i.test(message)
  );
}
