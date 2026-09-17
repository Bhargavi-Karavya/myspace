import { performance } from 'node:perf_hooks';
import type { Request, Response } from 'express';
import {
  generateJsonAnalysis,
  generateStructuredAnalysis,
  generateTestMessage,
  getGeminiErrorStatus,
  isGeminiQuotaOrRateLimitError,
  JsonOutputError,
  startMessageStream,
  StructuredOutputError,
} from '../services/gemini.service.js';
import {
  chatRequestSchema,
  jsonRequestSchema,
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
      console.error('JSON output failed:', {
        message: error.message,
        details: error.causeDetail,
      });
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

export async function chatWithAi(request: Request, response: Response) {
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

  let stream: Awaited<ReturnType<typeof startMessageStream>>;

  try {
    console.log('AI Gemini request started');
    stream = await startMessageStream(parsed.data.messages);
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
  let firstChunkLogged = false;

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
      writeSse(response, { text });
    }

    if (!response.writableEnded) {
      if (!clientDisconnected) {
        writeSse(response, { done: true });
      }
      response.end();
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

    // Quota / rate-limit after headers were sent: stay on SSE, never send JSON.
    if (isGeminiQuotaOrRateLimitError(error)) {
      writeSse(response, { error: SAFE_AI_UNAVAILABLE_ERROR });
      response.end();
      return;
    }

    // Capacity spike after some tokens: keep what we already sent instead of
    // failing the whole turn with a JSON/SSE error mid-reply.
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

    writeSse(response, {
      error: 'Unable to generate a response right now',
    });
    response.end();
  } finally {
    response.off('close', onResponseClose);
  }
}
