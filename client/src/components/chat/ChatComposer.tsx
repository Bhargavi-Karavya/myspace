import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { LuArrowRight, LuLoaderCircle, LuPaperclip } from 'react-icons/lu'
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
  const canSend = value.trim().length > 0 && !isDisabled && !isSending

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
      className="border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3 pb-3 pt-2 sm:px-4"
    >
      <div
        className={`mx-auto flex max-w-3xl items-end gap-1.5 rounded-2xl border bg-[var(--bg)] px-2 py-2 transition-[border-color,box-shadow] ${
          isDisabled
            ? 'border-[var(--border)] opacity-70'
            : 'border-[var(--border)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--composer-ring)]'
        }`}
      >
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
          placeholder="What's on your mind?"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 pr-1 text-[0.95rem] leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label={isSending ? 'Sending' : 'Send message'}
          className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition-[opacity,filter] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSending ? (
            <LuLoaderCircle size={18} strokeWidth={2} className="animate-spin" />
          ) : (
            <LuArrowRight size={18} strokeWidth={1.75} />
          )}
        </button>
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl px-1 text-center text-[11px] text-[var(--fg-muted)]">
        {hint}
      </p>
    </form>
  )
}
