import type { ReactNode } from 'react'
import { LuMoon, LuSun, LuUser } from 'react-icons/lu'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { IconButton } from '../ui/IconButton'

type MySpaceHeaderProps = {
  title?: string
  isDark: boolean
  onToggleTheme: () => void
  onProfile?: () => void
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
  trailingAction,
}: MySpaceHeaderProps) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        {title ? (
          <h1 className="font-sans text-lg font-bold tracking-[-0.03em] text-[var(--fg)]">
            {title}
          </h1>
        ) : (
          <MySpaceLogo size="sm" />
        )}

        <div className="flex items-center gap-0.5">
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
          {onProfile ? (
            <IconButton label="Profile" onClick={onProfile}>
              <LuUser size={18} strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      </div>
    </header>
  )
}
