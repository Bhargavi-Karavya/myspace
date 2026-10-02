import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { LuArrowUp, LuLoaderCircle, LuSparkles } from 'react-icons/lu'
import type { ChatComposerStatus } from '../../types/chat'

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  status?: ChatComposerStatus
  hint?: string
  /** Centered under welcome vs docked at bottom of chat */
  layout?: 'welcome' | 'docked'
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  status = 'idle',
  hint = 'MySpace can make mistakes. Check important info.',
  layout = 'docked',
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const labelId = useId()
  const isDisabled = status === 'disabled'
  const isSending = status === 'sending'
  const hasText = value.trim().length > 0
  const canSend = hasText && !isDisabled && !isSending
  const isWelcome = layout === 'welcome'

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
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

  const fields = (
    <>
      {isWelcome ? (
        <span
          className="hidden shrink-0 self-center text-[var(--accent)] sm:inline-flex"
          aria-hidden
        >
          <LuSparkles size={18} strokeWidth={1.85} />
        </span>
      ) : null}

      <label htmlFor={labelId} className="sr-only">
        Message MySpace
      </label>
      <textarea
        id={labelId}
        ref={textareaRef}
        rows={1}
        value={value}
        disabled={isDisabled || isSending}
        placeholder={isWelcome ? 'Ask anything' : 'Message MySpace…'}
        aria-label="Message MySpace"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className={`max-h-40 min-h-[44px] flex-1 resize-none bg-transparent text-[0.95rem] leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed ${
          isWelcome ? 'py-2' : 'py-2.5'
        }`}
      />

      <button
        type="submit"
        disabled={!canSend}
        aria-label={isSending ? 'Sending message' : 'Send message'}
        className="inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full bg-[var(--accent)] text-white transition-[opacity,transform] duration-150 hover:enabled:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        {isSending ? (
          <LuLoaderCircle size={17} strokeWidth={2} className="animate-spin" />
        ) : (
          <LuArrowUp size={17} strokeWidth={2.25} />
        )}
      </button>
    </>
  )

  return (
    <form
      onSubmit={handleSubmit}
      className={`composer-form w-full ${
        isWelcome
          ? 'composer-form--welcome px-4 pt-8 sm:px-6'
          : 'composer-form--docked safe-bottom shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4'
      }`}
      data-layout={layout}
    >
      <div className="mx-auto w-full max-w-4xl">
        {isWelcome ? (
          <div
            className="gemini-prompt"
            data-active={hasText ? 'true' : 'false'}
            data-busy={isSending ? 'true' : 'false'}
            data-disabled={isDisabled ? 'true' : 'false'}
          >
            <div className="gemini-prompt__glow" aria-hidden="true" />
            <div className="gemini-prompt__shell">{fields}</div>
          </div>
        ) : (
          <div
            className="composer-shell flex items-center gap-2 rounded-[1.5rem] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow-composer)]"
            data-busy={isSending ? 'true' : 'false'}
          >
            {fields}
          </div>
        )}
        <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-[var(--fg-muted)]">
          {hint}
        </p>
      </div>
    </form>
  )
}
