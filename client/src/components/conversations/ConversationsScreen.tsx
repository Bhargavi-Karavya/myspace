import type { ReactNode } from 'react'
import {
  LuChevronRight,
  LuHeart,
  LuInfinity,
  LuPlus,
  LuTrendingUp,
} from 'react-icons/lu'
import type { ConversationPreview } from '../../data/sampleConversations'
import { SAMPLE_CONVERSATIONS } from '../../data/sampleConversations'

type ConversationsScreenProps = {
  onOpenConversation?: (conversation: ConversationPreview) => void
  onStartNew?: () => void
}

const toneMeta: Record<
  NonNullable<ConversationPreview['tone']>,
  { label: string; icon: ReactNode }
> = {
  reflection: {
    label: 'Reflect',
    icon: <LuHeart size={13} strokeWidth={1.75} />,
  },
  planning: {
    label: 'Plan',
    icon: <LuTrendingUp size={13} strokeWidth={1.75} />,
  },
  clarity: {
    label: 'Clarity',
    icon: <LuInfinity size={13} strokeWidth={1.75} />,
  },
}

export function ConversationsScreen({
  onOpenConversation,
  onStartNew,
}: ConversationsScreenProps) {
  return (
    <div className="scrollbar-myspace scroll-fade-y mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mb-5">
        <p className="text-sm text-[var(--fg-muted)]">
          Pick up a thread, or begin a new one when something is on your mind.
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {SAMPLE_CONVERSATIONS.map((conversation) => {
          const tone = conversation.tone
            ? toneMeta[conversation.tone]
            : undefined

          return (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onOpenConversation?.(conversation)}
                className="group flex w-full items-start gap-3 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-[var(--bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  {tone?.icon ?? <LuInfinity size={16} strokeWidth={1.75} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <h2 className="font-medium text-[var(--fg)] group-hover:text-[var(--accent)]">
                      {conversation.title}
                    </h2>
                    <span className="shrink-0 text-xs text-[var(--fg-muted)]">
                      {conversation.updatedAt}
                    </span>
                  </span>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--fg-muted)]">
                    {conversation.preview}
                  </p>
                  {tone ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--accent)]">
                      {tone.icon}
                      {tone.label}
                    </span>
                  ) : null}
                </span>
                <LuChevronRight
                  size={16}
                  strokeWidth={1.75}
                  className="mt-2 shrink-0 text-[var(--fg-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 border-t border-[var(--border)] pt-5">
        <button
          type="button"
          onClick={onStartNew}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-3.5 text-sm font-medium text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <LuPlus size={16} strokeWidth={1.75} />
          Start a new conversation
        </button>
      </div>
    </div>
  )
}
