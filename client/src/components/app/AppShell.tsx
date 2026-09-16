import { useEffect, useState, type ReactNode } from 'react'
import { LuPlus, LuSparkles } from 'react-icons/lu'
import { EXAMPLE_MESSAGES } from '../../data/exampleMessages'
import type { ChatMessage } from '../../types/chat'
import type { NavItemId } from '../../types/navigation'
import { HomeScreen } from '../chat/HomeScreen'
import { ContextScreen } from '../context/ContextScreen'
import { ConversationsScreen } from '../conversations/ConversationsScreen'
import { MySpaceHeader } from '../layout/MySpaceHeader'
import { BottomNavigation } from '../navigation/BottomNavigation'
import { ProfileScreen } from '../profile/ProfileScreen'

function getPreferredTheme(): boolean {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem('myspace-theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const PAGE_TITLES: Partial<Record<NavItemId, string>> = {
  conversations: 'Conversations',
  context: 'Context',
  profile: 'Profile',
}

type HomeSeed = {
  id: number
  messages: ChatMessage[]
}

export function AppShell() {
  const [activePage, setActivePage] = useState<NavItemId>('home')
  const [isDark, setIsDark] = useState(getPreferredTheme)
  const [homeSeed, setHomeSeed] = useState<HomeSeed>({
    id: 0,
    messages: [],
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    window.localStorage.setItem('myspace-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  function toggleTheme() {
    setIsDark((prev) => !prev)
  }

  function goHomeFresh() {
    setHomeSeed({ id: Date.now(), messages: [] })
    setActivePage('home')
  }

  function goHomeWithExample() {
    setHomeSeed({ id: Date.now(), messages: EXAMPLE_MESSAGES })
    setActivePage('home')
  }

  let trailingAction:
    | { label: string; onClick: () => void; icon: ReactNode }
    | undefined

  if (activePage === 'home') {
    trailingAction = {
      label: 'Show example conversation',
      onClick: goHomeWithExample,
      icon: <LuSparkles size={18} strokeWidth={1.75} />,
    }
  } else if (activePage === 'conversations') {
    trailingAction = {
      label: 'Start a new conversation',
      onClick: goHomeFresh,
      icon: <LuPlus size={18} strokeWidth={1.75} />,
    }
  } else if (activePage === 'context') {
    trailingAction = {
      label: 'Add context',
      onClick: () => undefined,
      icon: <LuPlus size={18} strokeWidth={1.75} />,
    }
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      <MySpaceHeader
        title={PAGE_TITLES[activePage]}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onProfile={
          activePage === 'profile' ? undefined : () => setActivePage('profile')
        }
        trailingAction={trailingAction}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activePage === 'home' ? (
          <HomeScreen
            key={homeSeed.id}
            initialMessages={homeSeed.messages}
          />
        ) : null}
        {activePage === 'conversations' ? (
          <ConversationsScreen
            onOpenConversation={goHomeWithExample}
            onStartNew={goHomeFresh}
          />
        ) : null}
        {activePage === 'context' ? <ContextScreen /> : null}
        {activePage === 'profile' ? (
          <ProfileScreen isDark={isDark} onToggleTheme={toggleTheme} />
        ) : null}
      </main>

      <div className="shrink-0">
        <BottomNavigation activeId={activePage} onNavigate={setActivePage} />
      </div>
    </div>
  )
}
