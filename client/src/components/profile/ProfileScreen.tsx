import type { ReactNode } from 'react'
import { useAuth } from '../../lib/AuthProvider'
import type { AuthMode } from '../auth/AuthScreen'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { Button } from '../ui/Button'

type ProfileScreenProps = {
  isDark: boolean
  onToggleTheme: () => void
  onOpenAuth?: (mode: AuthMode) => void
}

type SettingRowProps = {
  label: string
  description: string
  action: ReactNode
}

function SettingRow({ label, description, action }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3.5">
      <div className="min-w-0">
        <p className="font-medium text-[var(--fg)]">{label}</p>
        <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

export function ProfileScreen({
  isDark,
  onToggleTheme,
  onOpenAuth,
}: ProfileScreenProps) {
  const { user, loading, signOut } = useAuth()

  const displayName =
    user?.name?.trim() ||
    (typeof user?.email === 'string' ? user.email.split('@')[0] : null) ||
    'Your space'

  return (
    <div className="scrollbar-myspace scroll-fade-y mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <section className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4">
          <MySpaceLogo size="lg" />
        </div>
        <h2 className="font-sans text-xl font-bold tracking-[-0.02em] text-[var(--fg)]">
          {loading ? 'Your space' : user ? displayName : 'Your space'}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--fg-muted)]">
          {user
            ? user.email || 'Signed in to MySpace'
            : 'A private place to think out loud. Sign in to sync your account across devices.'}
        </p>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--fg-muted)] uppercase">
          Account
        </h3>
        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-5 text-sm text-[var(--fg-muted)]">
            Checking session…
          </div>
        ) : user ? (
          <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4">
            <SettingRow
              label={displayName}
              description={user.email || 'Signed in'}
              action={
                <Button variant="soft" size="sm" onClick={() => void signOut()}>
                  Sign out
                </Button>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4">
            <SettingRow
              label="Not signed in"
              description="Log in or create an account"
              action={
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenAuth?.('sign-in')}
                  >
                    Log in
                  </Button>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => onOpenAuth?.('sign-up')}
                  >
                    Sign up
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--fg-muted)] uppercase">
          Appearance
        </h3>
        <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4">
          <SettingRow
            label="Appearance"
            description={isDark ? 'Dark mode is on' : 'Light mode is on'}
            action={
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={onToggleTheme}
                className={`relative h-7 w-12 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isDark ? 'bg-[var(--accent)]' : 'bg-[var(--bg-soft)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                    isDark ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            }
          />
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--fg-muted)] uppercase">
          Space
        </h3>
        <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4">
          <SettingRow
            label="Personal context"
            description="What MySpace remembers about you"
            action={
              <span className="text-xs font-medium text-[var(--accent)]">Soon</span>
            }
          />
          <SettingRow
            label="Conversation history"
            description="Your past threads stay private"
            action={
              <span className="text-xs font-medium text-[var(--accent)]">Soon</span>
            }
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--fg-muted)] uppercase">
          About
        </h3>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            MySpace is a personal context and reflection assistant — not a social
            network, not a diagnosis tool. Think freely; clarity can follow.
          </p>
        </div>
      </section>
    </div>
  )
}
