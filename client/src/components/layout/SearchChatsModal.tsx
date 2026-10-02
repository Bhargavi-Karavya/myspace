import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuMessageSquare, LuSearch, LuX } from 'react-icons/lu'
import type { ConversationPreview } from '../../data/sampleConversations'
import { IconButton } from '../ui/IconButton'

type SearchChatsModalProps = {
  open: boolean
  conversations: ConversationPreview[]
  activeConversationId: string | null
  onClose: () => void
  onSelect: (conversation: ConversationPreview) => void
  onNewChat: () => void
}

export function SearchChatsModal({
  open,
  conversations,
  activeConversationId,
  onClose,
  onSelect,
  onNewChat,
}: SearchChatsModalProps) {
  const titleId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q),
    )
  }, [conversations, query])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:pt-[14vh]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--fg)_32%,transparent)] backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(70vh,32rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-composer)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <LuSearch
            size={18}
            strokeWidth={1.85}
            className="shrink-0 text-[var(--fg-muted)]"
            aria-hidden
          />
          <label htmlFor={inputId} className="sr-only" id={titleId}>
            Search chats
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-[0.95rem] text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
              aria-label="Clear search"
            >
              <LuX size={16} strokeWidth={2} />
            </button>
          ) : (
            <IconButton label="Close search" onClick={onClose} className="h-8 w-8">
              <LuX size={16} strokeWidth={2} />
            </IconButton>
          )}
        </div>

        <div className="scrollbar-myspace min-h-0 flex-1 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--fg)] transition-colors hover:bg-[var(--bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <LuMessageSquare size={16} strokeWidth={1.85} />
            </span>
            <span className="font-medium">New chat</span>
          </button>

          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--fg-muted)]">
              {query.trim()
                ? `No chats match “${query.trim()}”.`
                : 'No chats yet.'}
            </p>
          ) : (
            <>
              <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--fg-muted)] uppercase">
                {query.trim() ? 'Results' : 'Recent'}
              </p>
              <ul className="flex flex-col gap-0.5">
                {filtered.map((conversation) => {
                  const active = conversation.id === activeConversationId
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(conversation)
                          onClose()
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                          active
                            ? 'bg-[var(--accent-soft)]'
                            : 'hover:bg-[var(--bg-soft)]'
                        }`}
                        aria-current={active ? 'true' : undefined}
                      >
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-soft)] text-[var(--fg-muted)]">
                          <LuMessageSquare size={15} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm font-medium text-[var(--fg)]">
                            {conversation.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fg-muted)]">
                            <span>{conversation.updatedAt}</span>
                            {conversation.preview ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="line-clamp-1">
                                  {conversation.preview}
                                </span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
