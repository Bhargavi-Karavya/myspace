import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { LuArrowUp, LuLoaderCircle, LuPaperclip } from 'react-icons/lu'
import type { ChatComposerStatus } from '../../types/chat'
import { IconButton } from '../ui/IconButton'

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  status?: ChatComposerStatus
  hint?: string
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  status = 'idle',
  hint = 'Connected to MySpace chat API · identical messages reuse a saved reply',
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const labelId = useId()
  const isDisabled = status === 'disabled'
  const isSending = status === 'sending'
  const hasText = value.trim().length > 0
  const canSend = hasText && !isDisabled && !isSending

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[color-mix(in_srgb,var(--border)_65%,transparent)] bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] px-3 pb-3 pt-3 backdrop-blur-xl sm:px-4"
    >
      <div
        className="gemini-prompt mx-auto max-w-3xl"
        data-active={hasText ? 'true' : 'false'}
        data-busy={isSending ? 'true' : 'false'}
        data-disabled={isDisabled ? 'true' : 'false'}
      >
        <div className="gemini-prompt__glow" aria-hidden="true" />
        <div className="gemini-prompt__shell">
          <IconButton
            label="Add context"
            disabled={isDisabled || isSending}
            className="mb-0.5 shrink-0"
          >
            <LuPaperclip size={18} strokeWidth={1.75} />
          </IconButton>

          <label htmlFor={labelId} className="sr-only">
            Message
          </label>
          <textarea
            id={labelId}
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={isDisabled || isSending}
            placeholder="Ask MySpace anything…"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 pr-1 text-[0.95rem] leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={isSending ? 'Sending' : 'Send message'}
            className="gemini-prompt__send mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] transition-[opacity,transform,filter] duration-200 hover:brightness-110 hover:enabled:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isSending ? (
              <LuLoaderCircle size={18} strokeWidth={2} className="animate-spin" />
            ) : (
              <LuArrowUp size={18} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-[11px] text-[var(--fg-muted)]">
        {hint}
      </p>
    </form>
  )
}
