import { useEffect, useState } from 'react'
import { ChatRequestError, sendChatMessages } from '../../services/chatApi'
import type { ChatComposerStatus, ChatMessage } from '../../types/chat'
import { ChatComposer } from './ChatComposer'
import { ChatThread } from './ChatThread'

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type HomeScreenProps = {
  initialMessages?: ChatMessage[]
  conversationId?: string | null
  onConversationIdChange?: (conversationId: string) => void
}

export function HomeScreen({
  initialMessages = [],
  conversationId = null,
  onConversationIdChange,
}: HomeScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedCache, setUsedCache] = useState(false)
  const [quotaBlockedUntil, setQuotaBlockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setActiveConversationId(conversationId)
  }, [conversationId])

  useEffect(() => {
    if (!quotaBlockedUntil) return

    const id = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= quotaBlockedUntil) {
        setQuotaBlockedUntil(null)
        setError(null)
      }
    }, 1000)

    return () => window.clearInterval(id)
  }, [quotaBlockedUntil])

  const quotaSecondsLeft = quotaBlockedUntil
    ? Math.max(0, Math.ceil((quotaBlockedUntil - now) / 1000))
    : 0
  const isQuotaBlocked = quotaSecondsLeft > 0

  function rememberConversationId(nextId: string | undefined) {
    if (!nextId || nextId === activeConversationId) return
    setActiveConversationId(nextId)
    onConversationIdChange?.(nextId)
  }

  async function requestModelReply(conversation: ChatMessage[]) {
    if (isQuotaBlocked) {
      setError(
        `Gemini free-tier limit reached. Please wait ${quotaSecondsLeft}s before trying a new message.`,
      )
      return
    }

    setError(null)
    setUsedCache(false)
    setIsSending(true)

    const modelMessageId = createId()
    let startedModelMessage = false

    try {
      const result = await sendChatMessages(
        conversation.map(({ role, content }) => ({ role, content })),
        {
          conversationId: activeConversationId ?? undefined,
          onChunk: (chunk) => {
            if (!startedModelMessage) {
              startedModelMessage = true
              setMessages((current) => [
                ...current,
                {
                  id: modelMessageId,
                  role: 'model',
                  content: chunk,
                },
              ])
              return
            }

            setMessages((current) =>
              current.map((message) =>
                message.id === modelMessageId
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            )
          },
        },
      )

      rememberConversationId(result.conversationId)

      if (!startedModelMessage) {
        setMessages((current) => [
          ...current,
          {
            id: modelMessageId,
            role: 'model',
            content: result.message,
          },
        ])
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === modelMessageId
              ? { ...message, content: result.message }
              : message,
          ),
        )
      }
      setUsedCache(result.fromCache)
    } catch (sendError) {
      if (sendError instanceof ChatRequestError && sendError.status === 429) {
        const waitSeconds = sendError.retryAfterSeconds ?? 60
        setQuotaBlockedUntil(Date.now() + waitSeconds * 1000)
        setError(
          `Gemini free-tier limit reached (20 requests/day). Wait ${waitSeconds}s. Do not keep retrying — that uses more quota.`,
        )
      } else if (
        sendError instanceof ChatRequestError &&
        (sendError.status === 503 || /busy|high demand/i.test(sendError.message))
      ) {
        if (!startedModelMessage) {
          setError(
            sendError.message ||
              'Gemini is busy right now. Please try again in a few seconds.',
          )
        } else {
          setError(
            'Reply may be incomplete (Gemini was briefly busy). You can resend to continue.',
          )
        }
      } else {
        if (startedModelMessage) {
          setMessages((current) =>
            current.filter((message) => message.id !== modelMessageId),
          )
        }
        const message =
          sendError instanceof Error
            ? sendError.message
            : 'Unable to generate a response right now'
        setError(message)
      }
    } finally {
      setIsSending(false)
    }
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isSending || isQuotaBlocked) return

    const last = messages[messages.length - 1]
    const canRetryFailedTurn =
      Boolean(error) &&
      !isQuotaBlocked &&
      last?.role === 'user' &&
      last.content === trimmed

    if (canRetryFailedTurn) {
      await requestModelReply(messages)
      return
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: trimmed,
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setDraft('')
    await requestModelReply(nextMessages)
  }

  const composerStatus: ChatComposerStatus = isSending
    ? 'sending'
    : isQuotaBlocked
      ? 'disabled'
      : draft.trim().length > 0
        ? 'typing'
        : 'idle'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatThread
        messages={messages}
        isSending={isSending}
        onSuggestionSelect={setDraft}
      />
      <div className="shrink-0">
        {error ? (
          <div className="msg-enter flex items-center justify-center gap-3 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-4 py-2 backdrop-blur-md">
            <p className="text-xs text-red-400">{error}</p>
            {!isQuotaBlocked ? (
              <button
                type="button"
                disabled={isSending}
                onClick={() => {
                  const last = messages[messages.length - 1]
                  if (last?.role === 'user') {
                    void requestModelReply(messages)
                  }
                }}
                className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <ChatComposer
          value={draft}
          onChange={(value) => {
            setDraft(value)
            if (error && !isQuotaBlocked) setError(null)
          }}
          onSubmit={() => {
            void sendMessage(draft)
          }}
          status={composerStatus}
          hint={
            isQuotaBlocked
              ? `Quota pause · ${quotaSecondsLeft}s left · identical old messages can still reuse saved replies`
              : usedCache
                ? 'Reused a saved reply for this exact message — Gemini was not called again'
                : activeConversationId
                  ? 'Saving this chat to Recent conversations'
                  : 'Connected to MySpace chat API · chats are saved after each reply'
          }
        />
      </div>
    </div>
  )
}
