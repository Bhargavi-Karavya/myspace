import { MySpaceLogo } from '../brand/MySpaceLogo'
import { SuggestionChip } from './SuggestionChip'

const SUGGESTIONS = [
  'Help me organize my thoughts',
  'I need clarity on something',
  'Help me plan what to do next',
  'I want to reflect on today',
] as const

type ChatWelcomeProps = {
  onSuggestionSelect: (text: string) => void
  disabled?: boolean
}

export function ChatWelcome({
  onSuggestionSelect,
  disabled = false,
}: ChatWelcomeProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-6 sm:px-6">
      <div className="welcome-enter w-full max-w-lg text-center">
        <div className="mb-5 flex justify-center">
          <div className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-3">
            <MySpaceLogo withWordmark={false} size="lg" />
          </div>
        </div>

        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.02em] text-[var(--fg)] sm:text-[2.15rem]">
          What&apos;s on your mind?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-relaxed text-[var(--fg-muted)]">
          Write freely. MySpace can help you organize your thoughts, reflect, and
          gain clarity.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:mt-8 sm:gap-2.5">
          {SUGGESTIONS.map((suggestion, index) => (
            <div
              key={suggestion}
              className="chip-enter"
              style={{ animationDelay: `${120 + index * 70}ms` }}
            >
              <SuggestionChip
                label={suggestion}
                onSelect={onSuggestionSelect}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
