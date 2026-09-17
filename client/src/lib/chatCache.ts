import type { MessageRole } from '../types/chat'

export type ApiChatMessage = {
  role: MessageRole
  content: string
}

export type ChatRequestResult = {
  message: string
  fromCache: boolean
}

const CACHE_STORAGE_KEY = 'myspace-chat-response-cache-v1'
const MAX_CACHE_ENTRIES = 80

type CacheStore = Record<string, string>

const memoryCache = new Map<string, string>()
const inflightRequests = new Map<string, Promise<ChatRequestResult>>()

function normalizeMessages(messages: ApiChatMessage[]): ApiChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }))
}

export function buildChatCacheKey(messages: ApiChatMessage[]): string {
  return JSON.stringify(normalizeMessages(messages))
}

function readPersistedCache(): CacheStore {
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as CacheStore
  } catch {
    return {}
  }
}

function writePersistedCache(store: CacheStore) {
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore quota / private-mode failures; memory cache still works.
  }
}

function touchPersistedEntry(key: string, value: string) {
  const store = readPersistedCache()
  delete store[key]
  store[key] = value

  const keys = Object.keys(store)
  if (keys.length > MAX_CACHE_ENTRIES) {
    const removeCount = keys.length - MAX_CACHE_ENTRIES
    for (let index = 0; index < removeCount; index += 1) {
      const oldestKey = keys[index]
      if (oldestKey) delete store[oldestKey]
    }
  }

  writePersistedCache(store)
}

export function getCachedChatResponse(messages: ApiChatMessage[]): string | null {
  const key = buildChatCacheKey(messages)
  const memoryHit = memoryCache.get(key)
  if (memoryHit) return memoryHit

  const persisted = readPersistedCache()[key]
  if (typeof persisted === 'string' && persisted.length > 0) {
    memoryCache.set(key, persisted)
    return persisted
  }

  return null
}

export function setCachedChatResponse(
  messages: ApiChatMessage[],
  response: string,
) {
  const key = buildChatCacheKey(messages)
  memoryCache.set(key, response)
  touchPersistedEntry(key, response)
}

export function getInflightChatRequest(
  messages: ApiChatMessage[],
): Promise<ChatRequestResult> | undefined {
  return inflightRequests.get(buildChatCacheKey(messages))
}

export function setInflightChatRequest(
  messages: ApiChatMessage[],
  request: Promise<ChatRequestResult>,
) {
  const key = buildChatCacheKey(messages)
  inflightRequests.set(key, request)

  const clear = () => {
    if (inflightRequests.get(key) === request) {
      inflightRequests.delete(key)
    }
  }

  request.then(clear, clear)
}
