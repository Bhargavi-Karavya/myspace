import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../types/chat'
import { ChatMessageBubble, ChatThinkingBubble } from './ChatMessage'

type ChatThreadProps = {
  messages: ChatMessage[]
  isSending: boolean
}

export function ChatThread({ messages, isSending }: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const lastMessage = messages[messages.length - 1]
  const streamingId =
    isSending && lastMessage?.role === 'model' ? lastMessage.id : null
  const showThinking = isSending && lastMessage?.role !== 'model'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSending, showThinking])

  return (
    <div className="scrollbar-myspace mx-auto flex w-full min-h-0 max-w-4xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6">
      {messages.map((message) => (
        <ChatMessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id === streamingId}
        />
      ))}

      {showThinking ? <ChatThinkingBubble /> : null}

      <div ref={endRef} className="h-2 shrink-0" />
    </div>
  )
}
