import type { ChatMessage } from '../../types/chat'
import { MySpaceLogo } from '../brand/MySpaceLogo'

type ChatMessageProps = {
  message: ChatMessage
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      data-role={message.role}
    >
      <div
        className={`flex max-w-[92%] gap-2.5 sm:max-w-[85%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {!isUser ? (
          <div className="mt-0.5 shrink-0">
            <MySpaceLogo withWordmark={false} size="sm" />
          </div>
        ) : null}

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[0.95rem] leading-relaxed ${
            isUser
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)]'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  )
}
