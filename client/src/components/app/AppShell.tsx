import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LuPlus, LuSparkles } from 'react-icons/lu'
import { EXAMPLE_MESSAGES } from '../../data/exampleMessages'
import type { ConversationPreview } from '../../data/sampleConversations'
import {
  fetchConversation,
  fetchRecentConversations,
} from '../../services/chatApi'
import type { ChatMessage } from '../../types/chat'
import type { NavItemId } from '../../types/navigation'
import { HomeScreen } from '../chat/HomeScreen'
import { ContextScreen } from '../context/ContextScreen'
import { ConversationsScreen } from '../conversations/ConversationsScreen'
import { MySpaceHeader } from '../layout/MySpaceHeader'
import { BottomNavigation } from '../navigation/BottomNavigation'
import { ProfileScreen } from '../profile/ProfileScreen'

function getPreferredTheme(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem('myspace-theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  // AI Studio–style default: dark
  return true
}

const PAGE_TITLES: Partial<Record<NavItemId, string>> = {
  conversations: 'Conversations',
  context: 'Context',
  profile: 'Profile',
}

type HomeSeed = {
  id: number
  conversationId: string | null
  messages: ChatMessage[]
}

export function AppShell() {
  const [activePage, setActivePage] = useState<NavItemId>('home')
  const [isDark, setIsDark] = useState(getPreferredTheme)
  const [homeSeed, setHomeSeed] = useState<HomeSeed>({
    id: 0,
    conversationId: null,
    messages: [],
  })
  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    window.localStorage.setItem('myspace-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true)
    setConversationsError(null)
    try {
      const rows = await fetchRecentConversations()
      setConversations(rows)
    } catch (error) {
      setConversationsError(
        error instanceof Error
          ? error.message
          : 'Unable to load conversations right now',
      )
    } finally {
      setConversationsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activePage === 'conversations') {
      void loadConversations()
    }
  }, [activePage, loadConversations])

  function toggleTheme() {
    setIsDark((prev) => !prev)
  }

  function goHomeFresh() {
    setHomeSeed({ id: Date.now(), conversationId: null, messages: [] })
    setActivePage('home')
  }

  function goHomeWithExample() {
    setHomeSeed({
      id: Date.now(),
      conversationId: null,
      messages: EXAMPLE_MESSAGES,
    })
    setActivePage('home')
  }

  async function openConversation(conversation: ConversationPreview) {
    try {
      const detail = await fetchConversation(conversation.id)
      setHomeSeed({
        id: Date.now(),
        conversationId: detail.id,
        messages: detail.messages,
      })
      setActivePage('home')
    } catch (error) {
      setConversationsError(
        error instanceof Error
          ? error.message
          : 'Unable to open conversation right now',
      )
    }
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
    <div className="studio-backdrop flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
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
            conversationId={homeSeed.conversationId}
            onConversationIdChange={(conversationId) => {
              setHomeSeed((current) =>
                current.conversationId === conversationId
                  ? current
                  : { ...current, conversationId },
              )
            }}
          />
        ) : null}
        {activePage === 'conversations' ? (
          <ConversationsScreen
            conversations={conversations}
            loading={conversationsLoading}
            error={conversationsError}
            onOpenConversation={(conversation) => {
              void openConversation(conversation)
            }}
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
