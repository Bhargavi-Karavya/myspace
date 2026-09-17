import type { ChatMessage, MessageRole } from '../types/chat'
import {
  getCachedChatResponse,
  getInflightChatRequest,
  setCachedChatResponse,
  setInflightChatRequest,
  type ApiChatMessage,
  type ChatRequestResult,
} from '../lib/chatCache'

export type ChatApiError = {
  error: string
  details?: Array<{ field: string; message: string }>
  retryAfterSeconds?: number
}

export class ChatRequestError extends Error {
  retryAfterSeconds?: number
  status?: number

  constructor(message: string, options?: { retryAfterSeconds?: number; status?: number }) {
    super(message)
    this.name = 'ChatRequestError'
    this.retryAfterSeconds = options?.retryAfterSeconds
    this.status = options?.status
  }
}

type StreamEvent =
  | { text: string }
  | { done: true }
  | { error: string; retryAfterSeconds?: number; status?: number }

function toApiMessages(
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
): ApiChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function readErrorPayload(response: Response): Promise<ChatApiError | null> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json().catch(() => null)) as ChatApiError | null
  }

  const text = await response.text().catch(() => '')
  if (!text) return null

  try {
    return JSON.parse(text) as ChatApiError
  } catch {
    return { error: text }
  }
}

function parseSseChunk(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''

  for (const part of parts) {
    const dataLines = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())

    if (dataLines.length === 0) continue

    try {
      const parsed = JSON.parse(dataLines.join('\n')) as StreamEvent
      events.push(parsed)
    } catch {
      // Ignore malformed SSE frames.
    }
  }

  return { events, rest }
}

async function requestChatResponseOnce(
  messages: ApiChatMessage[],
  onChunk?: (text: string) => void,
): Promise<ChatRequestResult> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    const payload = await readErrorPayload(response)
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Unable to generate a response right now'
    const retryAfterSeconds =
      payload && typeof payload.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : undefined

    throw new ChatRequestError(errorMessage, {
      status: response.status,
      retryAfterSeconds,
    })
  }

  if (!response.body) {
    throw new Error('Unable to generate a response right now')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let message = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseChunk(buffer)
    buffer = parsed.rest

    for (const event of parsed.events) {
      if ('error' in event && typeof event.error === 'string') {
        // Keep any tokens already shown; only fail hard when nothing arrived.
        if (message.trim()) {
          console.warn('[chat] stream error after partial reply; keeping text', {
            chars: message.length,
            error: event.error,
          })
          return { message, fromCache: false }
        }

        throw new ChatRequestError(event.error, {
          status: typeof event.status === 'number' ? event.status : 500,
          retryAfterSeconds:
            typeof event.retryAfterSeconds === 'number'
              ? event.retryAfterSeconds
              : undefined,
        })
      }

      if ('text' in event && typeof event.text === 'string' && event.text.length > 0) {
        message += event.text
        onChunk?.(event.text)
      }

      if ('done' in event && event.done) {
        if (!message.trim()) {
          throw new Error('Unable to generate a response right now')
        }

        console.log('[chat] stream complete', { chars: message.length })
        return { message, fromCache: false }
      }
    }
  }

  // Stream ended without an explicit done frame — still accept accumulated text.
  if (!message.trim()) {
    throw new Error('Unable to generate a response right now')
  }

  console.log('[chat] stream ended', { chars: message.length })
  return { message, fromCache: false }
}

async function requestChatResponse(
  messages: ApiChatMessage[],
  onChunk?: (text: string) => void,
): Promise<ChatRequestResult> {
  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestChatResponseOnce(messages, onChunk)
    } catch (error) {
      lastError = error
      const busyError =
        error instanceof ChatRequestError &&
        (error.status === 503 || /busy|high demand/i.test(error.message))
          ? error
          : null

      if (busyError && attempt < maxAttempts) {
        const waitMs = (busyError.retryAfterSeconds ?? 5) * 1000
        console.warn(
          `[chat] Gemini busy (503). Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})...`,
        )
        await sleep(waitMs)
        continue
      }

      throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to generate a response right now')
}

/**
 * Calls the chat API once per unique conversation payload.
 * Identical message histories reuse a cached reply (memory + localStorage)
 * and concurrent duplicates share one in-flight request.
 */
export async function sendChatMessages(
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
  onChunk?: (text: string) => void,
): Promise<ChatRequestResult> {
  const apiMessages = toApiMessages(messages)

  const cached = getCachedChatResponse(apiMessages)
  if (cached) {
    console.log('[chat] cache hit', { chars: cached.length })
    onChunk?.(cached)
    return { message: cached, fromCache: true }
  }

  const inflight = getInflightChatRequest(apiMessages)
  if (inflight) {
    const result = await inflight
    console.log('[chat] joined in-flight request', { chars: result.message.length })
    return { message: result.message, fromCache: true }
  }

  const request = requestChatResponse(apiMessages, onChunk)
  setInflightChatRequest(apiMessages, request)

  const result = await request
  setCachedChatResponse(apiMessages, result.message)
  return {
    message: result.message,
    fromCache: result.fromCache,
  }
}

export function isMessageRole(value: string): value is MessageRole {
  return value === 'user' || value === 'model'
}
