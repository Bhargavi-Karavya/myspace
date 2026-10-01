import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { ChatMessage } from '../../types/chat'
import { MySpaceLogo } from '../brand/MySpaceLogo'

type ChatMessageProps = {
  message: ChatMessage
  isStreaming?: boolean
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-[1.15rem] font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-3.5 text-[1.05rem] font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-[0.98rem] font-semibold tracking-tight text-[color-mix(in_srgb,var(--fg)_92%,var(--accent))] first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 text-[0.95rem] leading-[1.65] text-[color-mix(in_srgb,var(--fg)_94%,transparent)]">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 space-y-1.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 space-y-1.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[0.95rem] leading-[1.6] text-[color-mix(in_srgb,var(--fg)_94%,transparent)] [&>p]:mb-1">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--fg)]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-[color-mix(in_srgb,var(--fg)_88%,var(--accent))]">
      {children}
    </em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px] hover:opacity-85"
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-4 border-0 border-t border-[color-mix(in_srgb,var(--border)_85%,transparent)]" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-xl border-l-[3px] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-[0.92rem] text-[var(--fg-muted)]">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes('language-'))
    if (isBlock) {
      return (
        <code className="block overflow-x-auto font-mono text-[0.8rem] leading-relaxed text-[color-mix(in_srgb,var(--fg)_92%,white)]">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded-md border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-soft))] px-1.5 py-0.5 font-mono text-[0.82em] text-[color-mix(in_srgb,var(--fg)_90%,var(--accent))]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[color-mix(in_srgb,var(--bg)_78%,#000)] p-3.5 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] last:mb-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[16rem] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--fg)]">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--fg)_85%,var(--accent))]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-[color-mix(in_srgb,var(--border)_80%,transparent)] px-3 py-2 text-[var(--fg-muted)]">
      {children}
    </td>
  ),
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
        className={`flex max-w-[94%] gap-3 sm:max-w-[88%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {!isUser ? (
          <div className="mt-1 shrink-0">
            <div className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-0.5 ring-1 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
              <MySpaceLogo withWordmark={false} size="sm" />
            </div>
          </div>
        ) : null}

        <div
          className={`rounded-[1.25rem] px-4 py-3 text-[0.95rem] leading-relaxed ${
            isUser
              ? 'chat-bubble-user'
              : 'chat-bubble-assistant pl-5 text-[var(--fg)]'
          } ${isStreaming && !isUser ? 'typing-caret' : ''}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap font-medium leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatThinkingBubble() {
  return (
    <div className="msg-enter flex w-full justify-start" aria-live="polite">
      <div className="flex max-w-[94%] gap-3 sm:max-w-[88%]">
        <div className="mt-1 shrink-0">
          <div className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-0.5 ring-1 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
            <MySpaceLogo withWordmark={false} size="sm" />
          </div>
        </div>
        <div className="chat-bubble-assistant rounded-[1.25rem] px-4 py-3.5 pl-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex gap-1.5" aria-hidden>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] [animation:thinking-pulse_1.1s_ease-in-out_infinite]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] [animation:thinking-pulse_1.1s_ease-in-out_0.18s_infinite]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] [animation:thinking-pulse_1.1s_ease-in-out_0.36s_infinite]" />
            </span>
            <span className="text-sm text-[var(--fg-muted)]">Thinking…</span>
          </div>
        </div>
      </div>
    </div>
  )
}
