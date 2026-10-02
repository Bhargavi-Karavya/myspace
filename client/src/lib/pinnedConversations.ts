const STORAGE_KEY = 'myspace-pinned-conversations-v1'

function readStore(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string[]>
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, string[]>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function getPinnedConversationIds(userId: string): string[] {
  if (!userId) return []
  const list = readStore()[userId]
  return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []
}

export function setPinnedConversationIds(userId: string, ids: string[]) {
  if (!userId) return
  const store = readStore()
  store[userId] = [...new Set(ids)]
  writeStore(store)
}

export function togglePinnedConversationId(
  userId: string,
  conversationId: string,
): string[] {
  const current = getPinnedConversationIds(userId)
  const next = current.includes(conversationId)
    ? current.filter((id) => id !== conversationId)
    : [conversationId, ...current]
  setPinnedConversationIds(userId, next)
  return next
}
