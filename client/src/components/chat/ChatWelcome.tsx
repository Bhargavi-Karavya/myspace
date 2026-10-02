import type { IconType } from 'react-icons'
import {
  LuBrain,
  LuFocus,
  LuListChecks,
  LuNotebookPen,
} from 'react-icons/lu'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { SuggestionChip } from './SuggestionChip'

const SUGGESTIONS: ReadonlyArray<{
  label: string
  Icon: IconType
}> = [
  {
    label: 'Help me organize my thoughts',
    Icon: LuNotebookPen,
  },
  {
    label: 'I need clarity on something',
    Icon: LuFocus,
  },
  {
    label: 'Help me plan what to do next',
    Icon: LuListChecks,
  },
  {
    label: 'I want to reflect on today',
    Icon: LuBrain,
  },
]

type ChatWelcomeProps = {
  onSuggestionSelect: (text: string) => void
  disabled?: boolean
}

export function ChatWelcome({
  onSuggestionSelect,
  disabled = false,
}: ChatWelcomeProps) {
  return (
    <div className="welcome-enter w-full max-w-2xl px-4 text-center sm:px-6">
      <div className="mb-5 flex justify-center">
        <MySpaceLogo size="lg" />
      </div>

      <h1 className="font-display text-[1.85rem] font-semibold text-[var(--fg)] sm:text-[2.25rem]">
        What&apos;s on your mind?
      </h1>
      <p className="mx-auto mt-3.5 max-w-md text-[0.98rem] leading-relaxed text-[var(--fg-muted)]">
        Ask anything — organize thoughts, plan next steps, or reflect with
        MySpace.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2 sm:gap-2.5">
        {SUGGESTIONS.map(({ label, Icon }, index) => (
          <div
            key={label}
            className="chip-enter"
            style={{ animationDelay: `${80 + index * 50}ms` }}
          >
            <SuggestionChip
              label={label}
              icon={<Icon size={16} strokeWidth={1.85} />}
              onSelect={onSuggestionSelect}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
