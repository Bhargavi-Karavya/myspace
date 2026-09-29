import type { ChatMessage } from '../../types/chat'
import { MySpaceLogo } from '../brand/MySpaceLogo'

type ChatMessageProps = {
  message: ChatMessage
  isStreaming?: boolean
}

export function ChatMessageBubble({
  message,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`msg-enter flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
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
              ? 'bg-[var(--accent)] text-[#0b1220] dark:text-[#0b1220]'
              : 'border border-[color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] text-[var(--fg)] backdrop-blur-sm'
          }`}
        >
          <p
            className={`whitespace-pre-wrap ${
              isStreaming && !isUser ? 'typing-caret' : ''
            }`}
          >
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}
