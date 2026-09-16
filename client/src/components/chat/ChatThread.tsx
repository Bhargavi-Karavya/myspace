import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../types/chat'
import { ChatMessageBubble } from './ChatMessage'
import { ChatWelcome } from './ChatWelcome'

type ChatThreadProps = {
  messages: ChatMessage[]
  isSending: boolean
  onSuggestionSelect: (text: string) => void
}

export function ChatThread({
  messages,
  isSending,
  onSuggestionSelect,
}: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const hasMessages = messages.length > 0

  useEffect(() => {
    if (!hasMessages) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSending, hasMessages])

  if (!hasMessages) {
    return (
      <div className="scrollbar-myspace scroll-fade-y min-h-0 flex-1 overflow-y-auto">
        <ChatWelcome
          onSuggestionSelect={onSuggestionSelect}
          disabled={isSending}
        />
      </div>
    )
  }

  return (
    <div className="scrollbar-myspace scroll-fade-y mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
      {messages.map((message) => (
        <ChatMessageBubble key={message.id} message={message} />
      ))}

      {isSending ? (
        <div className="flex items-center gap-2 px-1 text-sm text-[var(--fg-muted)]">
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
          </span>
          Thinking…
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  )
}
