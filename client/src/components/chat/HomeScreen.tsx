import { useState } from 'react'
import type { ChatComposerStatus, ChatMessage } from '../../types/chat'
import { ChatComposer } from './ChatComposer'
import { ChatThread } from './ChatThread'

const LOCAL_REPLIES = [
  'That sounds worth sitting with for a moment. What feels most unclear about it right now?',
  "Let's untangle this together. What would feeling clearer look like for you?",
  'Start smaller than the whole problem. What is one piece you could name first?',
]

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type HomeScreenProps = {
  initialMessages?: ChatMessage[]
}

export function HomeScreen({ initialMessages = [] }: HomeScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)

  function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isSending) return

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: trimmed,
    }

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsSending(true)

    window.setTimeout(() => {
      const reply =
        LOCAL_REPLIES[Math.floor(Math.random() * LOCAL_REPLIES.length)] ??
        LOCAL_REPLIES[0]

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'model',
          content: reply,
        },
      ])
      setIsSending(false)
    }, 700)
  }

  const composerStatus: ChatComposerStatus = isSending
    ? 'sending'
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
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => sendMessage(draft)}
          status={composerStatus}
        />
      </div>
    </div>
  )
}
