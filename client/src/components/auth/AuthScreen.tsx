import { useState, type FormEvent } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { useAuth } from '../../lib/AuthProvider'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { Button } from '../ui/Button'

export type AuthMode = 'sign-in' | 'sign-up'

type AuthScreenProps = {
  initialMode?: AuthMode
  onSuccess?: () => void
}

export function AuthScreen({
  initialMode = 'sign-in',
  onSuccess,
}: AuthScreenProps) {
  const { configured, signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const message =
        mode === 'sign-up'
          ? await signUp(email, password, name)
          : await signIn(email, password)
      if (message) {
        setError(message)
        return
      }
      onSuccess?.()
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setBusy(true)
    try {
      const message = await signInWithGoogle()
      if (message) setError(message)
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-6 text-left shadow-[var(--shadow-composer)]">
        <p className="text-sm font-semibold text-[var(--fg)]">
          Auth not configured
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
          Set <code className="text-[var(--accent)]">VITE_NEON_AUTH_URL</code>{' '}
          from Neon Console → Auth → Configuration in{' '}
          <code className="text-[var(--fg)]">client/.env</code>, then restart
          the Vite server.
        </p>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)] transition-[border-color,box-shadow] focus-visible:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-visible:shadow-[0_0_0_3px_var(--composer-ring)]'

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-composer)]">
      <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-elevated))] px-5 pt-5 pb-4 sm:px-6">
        <div className="mb-3 flex justify-center pr-8">
          <MySpaceLogo size="sm" />
        </div>
        <h2 className="text-center font-display text-[1.3rem] font-semibold text-[var(--fg)] sm:text-[1.4rem]">
          {mode === 'sign-up' ? 'Create your space' : 'Welcome back'}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-center text-[13px] leading-relaxed text-[var(--fg-muted)]">
          {mode === 'sign-up'
            ? 'Save chats, unlock personal memory, and get responses tailored to you.'
            : 'Sign in to continue your conversations and personal memory.'}
        </p>
      </div>

      <div className="px-5 pt-3.5 pb-5 sm:px-6 sm:pb-5">
        <div className="mb-3.5 flex gap-1 rounded-full bg-[var(--bg-soft)] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('sign-in')
              setError(null)
            }}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              mode === 'sign-in'
                ? 'bg-[var(--bg-elevated)] text-[var(--fg)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('sign-up')
              setError(null)
            }}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              mode === 'sign-up'
                ? 'bg-[var(--bg-elevated)] text-[var(--fg)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'sign-up' ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold tracking-[0.04em] text-[var(--fg-muted)] uppercase">
                Name
              </span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className={inputClass}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-[0.04em] text-[var(--fg-muted)] uppercase">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-[0.04em] text-[var(--fg-muted)] uppercase">
              Password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={
                mode === 'sign-up' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </label>

          {error ? (
            <p className="rounded-xl bg-[color-mix(in_srgb,#d96570_12%,transparent)] px-3 py-2.5 text-sm text-[#b42318] dark:text-[#f5a8a0]">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-1 w-full rounded-full" disabled={busy}>
            {busy ? (
              <LuLoaderCircle className="animate-spin" size={18} />
            ) : mode === 'sign-up' ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)] uppercase">
            or
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--bg-soft)]"
          disabled={busy}
          onClick={() => void handleGoogle()}
        >
          <GoogleMark />
          Continue with Google
        </Button>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 36.3 44 31.5 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}
