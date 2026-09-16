import type { ReactNode } from 'react'
import {
  LuHeart,
  LuInfinity,
  LuNotebookText,
  LuPlus,
  LuTrendingUp,
} from 'react-icons/lu'
import { TbCirclesRelation } from 'react-icons/tb'
import {
  CONTEXT_CATEGORY_LABELS,
  SAMPLE_CONTEXT,
  type ContextItem,
} from '../../data/sampleContext'

type ContextScreenProps = {
  onAddContext?: () => void
}

const categoryOrder: ContextItem['category'][] = [
  'values',
  'goals',
  'patterns',
  'notes',
]

const categoryIcons: Record<ContextItem['category'], ReactNode> = {
  values: <LuHeart size={16} strokeWidth={1.75} />,
  goals: <LuTrendingUp size={16} strokeWidth={1.75} />,
  patterns: <LuInfinity size={16} strokeWidth={1.75} />,
  notes: <LuNotebookText size={16} strokeWidth={1.75} />,
}

export function ContextScreen({ onAddContext }: ContextScreenProps) {
  return (
    <div className="scrollbar-myspace scroll-fade-y mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mb-6 flex max-w-xl items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <TbCirclesRelation size={18} strokeWidth={1.75} />
        </span>
        <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
          Personal context MySpace can gently use later — what matters to you,
          what you&apos;re working toward, and patterns you&apos;ve noticed.
        </p>
      </div>

      <div className="flex flex-col gap-7">
        {categoryOrder.map((category) => {
          const items = SAMPLE_CONTEXT.filter((item) => item.category === category)
          if (items.length === 0) return null

          return (
            <section key={category} aria-labelledby={`context-${category}`}>
              <h2
                id={`context-${category}`}
                className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[var(--fg-muted)] uppercase"
              >
                <span className="text-[var(--accent)]">{categoryIcons[category]}</span>
                {CONTEXT_CATEGORY_LABELS[category]}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5"
                  >
                    <h3 className="text-[0.95rem] font-medium text-[var(--fg)]">
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--fg-muted)]">
                      {item.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="mt-8 pb-2">
        <button
          type="button"
          onClick={onAddContext}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-4 py-3.5 text-sm font-medium text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <LuPlus size={16} strokeWidth={1.75} />
          Add a piece of context
        </button>
        <p className="mt-3 text-center text-xs text-[var(--fg-muted)]">
          Preview only — saving context comes later
        </p>
      </div>
    </div>
  )
}
