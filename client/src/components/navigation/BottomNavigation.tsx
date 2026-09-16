import type { NavItemId } from '../../types/navigation'
import { LuHouse, LuMessagesSquare, LuUser } from 'react-icons/lu'
import { TbCirclesRelation } from 'react-icons/tb'

type BottomNavigationProps = {
  activeId?: NavItemId
  onNavigate: (id: NavItemId) => void
}

const items: { id: NavItemId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'context', label: 'Context' },
  { id: 'profile', label: 'Profile' },
]

function NavIcon({ id }: { id: NavItemId }) {
  const props = { size: 20, strokeWidth: 1.75 } as const
  switch (id) {
    case 'home':
      return <LuHouse {...props} />
    case 'conversations':
      return <LuMessagesSquare {...props} />
    case 'context':
      return <TbCirclesRelation {...props} />
    case 'profile':
      return <LuUser {...props} />
  }
}

export function BottomNavigation({
  activeId = 'home',
  onNavigate,
}: BottomNavigationProps) {
  return (
    <nav
      className="safe-bottom border-t border-[var(--border)] bg-[var(--bg-elevated)]"
      aria-label="Primary"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-4 px-2 py-1.5 sm:px-4">
        {items.map((item) => {
          const active = item.id === activeId

          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  active ? 'bg-[var(--accent-soft)]' : ''
                }`}
              >
                <NavIcon id={item.id} />
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
