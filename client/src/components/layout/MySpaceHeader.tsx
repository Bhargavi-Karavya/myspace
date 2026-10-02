import type { ReactNode } from 'react'
import { LuMoon, LuSun, LuUser } from 'react-icons/lu'
import { useAuth } from '../../lib/AuthProvider'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

type MySpaceHeaderProps = {
  title?: string
  isDark: boolean
  onToggleTheme: () => void
  onProfile?: () => void
  onSignIn?: () => void
  onSignUp?: () => void
  trailingAction?: {
    label: string
    onClick: () => void
    icon: ReactNode
  }
}

export function MySpaceHeader({
  title,
  isDark,
  onToggleTheme,
  onProfile,
  onSignIn,
  onSignUp,
  trailingAction,
}: MySpaceHeaderProps) {
  const { user, loading } = useAuth()
  const showAuthButtons = !loading && !user

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        {title ? (
          <h1 className="font-sans text-lg font-semibold tracking-[-0.02em] text-[var(--fg)]">
            {title}
          </h1>
        ) : (
          <MySpaceLogo size="sm" />
        )}

        <div className="flex items-center gap-1">
          {trailingAction ? (
            <IconButton label={trailingAction.label} onClick={trailingAction.onClick}>
              {trailingAction.icon}
            </IconButton>
          ) : null}
          <IconButton
            label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onToggleTheme}
          >
            {isDark ? (
              <LuSun size={18} strokeWidth={1.75} />
            ) : (
              <LuMoon size={18} strokeWidth={1.75} />
            )}
          </IconButton>

          {showAuthButtons ? (
            <div className="ml-1 flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5"
                onClick={onSignIn}
              >
                Log in
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="h-8 px-2.5"
                onClick={onSignUp}
              >
                Sign up
              </Button>
            </div>
          ) : null}

          {!showAuthButtons && !loading && onProfile ? (
            <IconButton label="Profile" onClick={onProfile}>
              <LuUser size={18} strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      </div>
    </header>
  )
}
