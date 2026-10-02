import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { LuX } from 'react-icons/lu'
import { AuthScreen, type AuthMode } from './AuthScreen'

type AuthModalProps = {
  open: boolean
  initialMode?: AuthMode
  onClose: () => void
}

export function AuthModal({
  open,
  initialMode = 'sign-in',
  onClose,
}: AuthModalProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close authentication dialog"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--fg)_40%,transparent)] backdrop-blur-[6px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in or sign up"
        className="auth-modal-enter relative z-10 max-h-[min(92dvh,40rem)] w-full max-w-[26rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-muted)] shadow-[var(--shadow-sm)] transition-[color,background-color,transform] duration-150 hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <LuX size={17} strokeWidth={2} />
        </button>

        {/* No scrollbar-gutter — gutter only appears when content actually overflows */}
        <div className="auth-modal-scroll max-h-[min(92dvh,40rem)] overflow-y-auto overscroll-contain rounded-3xl">
          <AuthScreen
            key={initialMode}
            initialMode={initialMode}
            onSuccess={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
