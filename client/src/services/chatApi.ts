import type { ChatMessage, MessageRole } from '../types/chat'
import type { ConversationPreview } from '../data/sampleConversations'
import {
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

export type ChatTurnResult = ChatRequestResult & {
  conversationId?: string
}

type StreamEvent =
  | { text: string }
  | { done: true }
  | { conversationId: string }
  | { error: string; retryAfterSeconds?: number; status?: number }

type StoredConversationMessage = {
  id: string
  role: MessageRole
  content: string
  createdAt: string
}

type StoredConversationDetail = {
  id: string
  title: string
  updatedAt: string
  messages: StoredConversationMessage[]
}

type StoredConversationListItem = {
  id: string
  title: string
  preview: string
  updatedAt: string
}

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

function formatRelativeUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  )
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (24 * 60 * 60 * 1000),
  )

  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
  conversationId: string | undefined,
  onChunk?: (text: string) => void,
): Promise<ChatTurnResult> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      messages,
      ...(conversationId ? { conversationId } : {}),
    }),
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
  let persistedConversationId = conversationId

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseChunk(buffer)
    buffer = parsed.rest

    for (const event of parsed.events) {
      if ('error' in event && typeof event.error === 'string') {
        if (message.trim()) {
          console.warn('[chat] stream error after partial reply; keeping text', {
            chars: message.length,
            error: event.error,
          })
          return {
            message,
            fromCache: false,
            conversationId: persistedConversationId,
          }
        }

        throw new ChatRequestError(event.error, {
          status: typeof event.status === 'number' ? event.status : 500,
          retryAfterSeconds:
            typeof event.retryAfterSeconds === 'number'
              ? event.retryAfterSeconds
              : undefined,
        })
      }

      if (
        'conversationId' in event &&
        typeof event.conversationId === 'string' &&
        event.conversationId.length > 0
      ) {
        persistedConversationId = event.conversationId
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
        return {
          message,
          fromCache: false,
          conversationId: persistedConversationId,
        }
      }
    }
  }

  if (!message.trim()) {
    throw new Error('Unable to generate a response right now')
  }

  console.log('[chat] stream ended', { chars: message.length })
  return {
    message,
    fromCache: false,
    conversationId: persistedConversationId,
  }
}

async function requestChatResponse(
  messages: ApiChatMessage[],
  conversationId: string | undefined,
  onChunk?: (text: string) => void,
): Promise<ChatTurnResult> {
  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestChatResponseOnce(messages, conversationId, onChunk)
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
 * Always hits the chat API so each turn can be persisted server-side.
 * Local response cache is not used here — a cache hit would skip saving.
 */
export async function sendChatMessages(
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
  options?: {
    conversationId?: string
    onChunk?: (text: string) => void
  },
): Promise<ChatTurnResult> {
  const apiMessages = toApiMessages(messages)
  const conversationId = options?.conversationId
  const onChunk = options?.onChunk

  const inflight = getInflightChatRequest(apiMessages)
  if (inflight) {
    const result = await inflight
    console.log('[chat] joined in-flight request', {
      chars: result.message.length,
    })
    onChunk?.(result.message)
    return {
      message: result.message,
      fromCache: true,
      conversationId: result.conversationId ?? conversationId,
    }
  }

  const request = requestChatResponse(apiMessages, conversationId, onChunk)
  setInflightChatRequest(apiMessages, request)

  const result = await request
  setCachedChatResponse(apiMessages, result.message)
  return {
    message: result.message,
    fromCache: false,
    conversationId: result.conversationId,
  }
}

export async function fetchRecentConversations(): Promise<ConversationPreview[]> {
  const response = await fetch('/api/ai/conversations')
  if (!response.ok) {
    throw new Error('Unable to load conversations right now')
  }

  const payload = (await response.json()) as {
    conversations?: StoredConversationListItem[]
  }

  return (payload.conversations ?? []).map((row) => ({
    id: row.id,
    title: row.title || 'Untitled conversation',
    preview: row.preview || 'No messages yet',
    updatedAt: formatRelativeUpdatedAt(row.updatedAt),
  }))
}

export async function fetchConversation(
  id: string,
): Promise<{ id: string; title: string; messages: ChatMessage[] }> {
  const response = await fetch(`/api/ai/conversations/${id}`)
  if (!response.ok) {
    throw new Error('Unable to load conversation right now')
  }

  const payload = (await response.json()) as StoredConversationDetail

  return {
    id: payload.id,
    title: payload.title,
    messages: (payload.messages ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  }
}

export function isMessageRole(value: string): value is MessageRole {
  return value === 'user' || value === 'model'
}
