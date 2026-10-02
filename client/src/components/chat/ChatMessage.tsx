import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { LuCheck, LuCopy } from 'react-icons/lu'
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
    <h3 className="mb-2 mt-3 text-[0.98rem] font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[0.95rem] leading-[1.7] last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 space-y-1.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 space-y-1.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[0.95rem] leading-[1.65] [&>p]:mb-1">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--fg)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[var(--accent)] underline underline-offset-[3px] hover:opacity-85"
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-4 border-0 border-t border-[var(--border)]" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-[3px] border-[var(--border)] pl-3 text-[0.92rem] text-[var(--fg-muted)]">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes('language-'))
    if (isBlock) {
      return (
        <code className="block overflow-x-auto font-mono text-[0.8rem] leading-relaxed">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded-md bg-[var(--bg-soft)] px-1.5 py-0.5 font-mono text-[0.82em]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3.5 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border)] last:mb-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[16rem] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[var(--bg-soft)] text-[var(--fg)]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-[var(--border)] px-3 py-2 text-[var(--fg-muted)]">
      {children}
    </td>
  ),
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export function ChatMessageBubble({
  message,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const canCopy =
    !isUser && !isStreaming && message.content.trim().length > 0

  async function handleCopy() {
    if (!canCopy) return
    const ok = await copyText(message.content)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className={`msg-enter group/msg flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      data-role={message.role}
    >
      <div
        className={`flex w-full max-w-4xl gap-3 ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {!isUser ? (
          <div className="mt-1 shrink-0">
            <MySpaceLogo withWordmark={false} size="sm" />
          </div>
        ) : null}

        <div className="min-w-0 max-w-[min(100%,48rem)]">
          <div
            className={`text-[0.95rem] leading-relaxed ${
              isUser
                ? 'rounded-3xl bg-[var(--user-bubble)] px-4 py-2.5 text-[var(--user-bubble-fg)] shadow-[var(--shadow-sm)]'
                : `rounded-2xl border border-[var(--assistant-bubble-border)] bg-[var(--assistant-bubble)] px-4 py-3 text-[var(--assistant-bubble-fg)] shadow-[var(--shadow-sm)] ${
                    isStreaming ? 'typing-caret' : ''
                  }`
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap leading-relaxed">
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

          {canCopy ? (
            <div className="mt-1.5 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100">
              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-label={copied ? 'Copied' : 'Copy response'}
                title={copied ? 'Copied' : 'Copy'}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {copied ? (
                  <LuCheck size={15} strokeWidth={2} />
                ) : (
                  <LuCopy size={15} strokeWidth={1.85} />
                )}
              </button>
              {copied ? (
                <span className="text-[11px] text-[var(--fg-muted)]">
                  Copied
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ChatThinkingBubble() {
  return (
    <div className="msg-enter flex w-full justify-start" aria-live="polite">
      <div className="flex max-w-4xl gap-3">
        <div className="mt-1 shrink-0">
          <MySpaceLogo withWordmark={false} size="sm" />
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--assistant-bubble-border)] bg-[var(--assistant-bubble)] px-4 py-3 shadow-[var(--shadow-sm)]">
          <span className="inline-flex gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)] [animation:thinking-pulse_1.1s_ease-in-out_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)] [animation:thinking-pulse_1.1s_ease-in-out_0.18s_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)] [animation:thinking-pulse_1.1s_ease-in-out_0.36s_infinite]" />
          </span>
          <span className="text-sm text-[var(--fg-muted)]">Thinking…</span>
        </div>
      </div>
    </div>
  )
}
