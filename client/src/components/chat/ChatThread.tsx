import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../types/chat'
import { ChatMessageBubble, ChatThinkingBubble } from './ChatMessage'
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
  const lastMessage = messages[messages.length - 1]
  const streamingId =
    isSending && lastMessage?.role === 'model' ? lastMessage.id : null
  const showThinking = isSending && lastMessage?.role !== 'model'

  useEffect(() => {
    if (!hasMessages && !showThinking) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSending, hasMessages, showThinking])

  if (!hasMessages && !showThinking) {
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
        <ChatMessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id === streamingId}
        />
      ))}

      {showThinking ? <ChatThinkingBubble /> : null}

      <div ref={endRef} />
    </div>
  )
}
