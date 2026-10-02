import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationPreview } from '../../data/sampleConversations'
import { useAuth } from '../../lib/AuthProvider'
import { clearChatCache } from '../../lib/chatCache'
import {
  getPinnedConversationIds,
  setPinnedConversationIds,
} from '../../lib/pinnedConversations'
import { useTheme } from '../../lib/ThemeProvider'
import {
  deleteConversation,
  fetchConversation,
  fetchRecentConversations,
  renameConversation,
} from '../../services/chatApi'
import type { ChatMessage } from '../../types/chat'
import type { NavItemId } from '../../types/navigation'
import { AuthModal } from '../auth/AuthModal'
import type { AuthMode } from '../auth/AuthScreen'
import { HomeScreen } from '../chat/HomeScreen'
import {
  AppSidebar,
  DesktopChatHeader,
  GuestAuthHeader,
  MobileChatHeader,
} from '../layout/AppSidebar'
import { ProfileScreen } from '../profile/ProfileScreen'

type HomeSeed = {
  id: number
  conversationId: string | null
  title: string | null
  messages: ChatMessage[]
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    function sync() {
      setIsMobile(media.matches)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [breakpoint])

  return isMobile
}

export function AppShell() {
  const { user, loading: authLoading } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const isMobile = useIsMobile()
  const prevUserIdRef = useRef<string | null>(null)
  const [activePage, setActivePage] = useState<NavItemId>('home')
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [authOpen, setAuthOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [homeSeed, setHomeSeed] = useState<HomeSeed>({
    id: 0,
    conversationId: null,
    title: null,
    messages: [],
  })
  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  )

  const openSignIn = useCallback(() => {
    setAuthMode('sign-in')
    setAuthOpen(true)
  }, [])

  const openSignUp = useCallback(() => {
    setAuthMode('sign-up')
    setAuthOpen(true)
  }, [])

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false)
  }, [isMobile])

  useEffect(() => {
    const nextId = user?.id ?? null
    const prev = prevUserIdRef.current
    if (prev !== nextId) {
      if (prev !== null || nextId === null) {
        clearChatCache()
        setHomeSeed({
          id: Date.now(),
          conversationId: null,
          title: null,
          messages: [],
        })
        setConversations([])
        setConversationsError(null)
      }
      prevUserIdRef.current = nextId
    }
  }, [user?.id])

  const loadConversations = useCallback(async () => {
    if (!user) {
      setConversations([])
      setConversationsLoading(false)
      setConversationsError(null)
      return
    }

    setConversationsLoading(true)
    setConversationsError(null)
    try {
      const rows = await fetchRecentConversations()
      setConversations(rows)
    } catch (error) {
      const aborted =
        (error instanceof DOMException && error.name === 'TimeoutError') ||
        (error instanceof Error &&
          (/aborted|timeout/i.test(error.name) ||
            /aborted|timeout/i.test(error.message)))
      setConversationsError(
        aborted
          ? 'Conversations request timed out. Is the API server running on port 5000?'
          : error instanceof Error
            ? error.message
            : 'Unable to load conversations right now',
      )
    } finally {
      setConversationsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void loadConversations()
  }, [authLoading, loadConversations, user?.id])

  function goHomeFresh() {
    setHomeSeed({
      id: Date.now(),
      conversationId: null,
      title: null,
      messages: [],
    })
    setActivePage('home')
  }

  async function openConversation(conversation: ConversationPreview) {
    if (!user) {
      setConversationsError('Please sign in to view your conversations')
      openSignIn()
      return
    }

    try {
      const detail = await fetchConversation(conversation.id)
      setHomeSeed({
        id: Date.now(),
        conversationId: detail.id,
        title: detail.title || conversation.title,
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

  async function handleRenameConversation(
    conversation: ConversationPreview,
    title: string,
  ) {
    if (!user) {
      openSignIn()
      return
    }

    const result = await renameConversation(conversation.id, title)
    setConversations((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? { ...item, title: result.title, updatedAt: 'Today' }
          : item,
      ),
    )
    setHomeSeed((current) =>
      current.conversationId === conversation.id
        ? { ...current, title: result.title }
        : current,
    )
  }

  async function handleDeleteConversation(conversation: ConversationPreview) {
    if (!user) {
      openSignIn()
      return
    }

    const confirmed = window.confirm(
      `Delete “${conversation.title}”? This cannot be undone.`,
    )
    if (!confirmed) return

    try {
      await deleteConversation(conversation.id)
      setConversations((current) =>
        current.filter((item) => item.id !== conversation.id),
      )
      if (user.id) {
        const nextPinned = getPinnedConversationIds(user.id).filter(
          (id) => id !== conversation.id,
        )
        setPinnedConversationIds(user.id, nextPinned)
      }
      if (homeSeed.conversationId === conversation.id) {
        goHomeFresh()
      }
    } catch (error) {
      setConversationsError(
        error instanceof Error
          ? error.message
          : 'Unable to delete conversation right now',
      )
    }
  }

  const headerTitle =
    activePage === 'profile' ? 'Profile' : homeSeed.title || 'New chat'

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <AppSidebar
        open={isMobile ? sidebarOpen : true}
        collapsed={sidebarCollapsed}
        isMobile={isMobile}
        conversations={conversations}
        conversationsLoading={conversationsLoading || authLoading}
        conversationsError={user ? conversationsError : null}
        activeConversationId={homeSeed.conversationId}
        onCloseMobile={() => setSidebarOpen(false)}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onNewChat={goHomeFresh}
        onOpenConversation={(conversation) => {
          void openConversation(conversation)
        }}
        onRenameConversation={(conversation, title) =>
          handleRenameConversation(conversation, title)
        }
        onDeleteConversation={(conversation) => {
          void handleDeleteConversation(conversation)
        }}
        onOpenProfile={() => setActivePage('profile')}
        onSignIn={openSignIn}
        onSignUp={openSignUp}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
        <MobileChatHeader
          onOpenSidebar={() => setSidebarOpen(true)}
          onNewChat={goHomeFresh}
          showGuestAuth={!authLoading && !user}
          onSignIn={openSignIn}
          onToggleTheme={toggleTheme}
          isDark={isDark}
        />

        {!authLoading && !user ? (
          <GuestAuthHeader
            onSignIn={openSignIn}
            onSignUp={openSignUp}
            onToggleTheme={toggleTheme}
            isDark={isDark}
          />
        ) : null}

        {!authLoading && user ? (
          <DesktopChatHeader
            title={headerTitle}
            onToggleTheme={toggleTheme}
            isDark={isDark}
            onNewChat={goHomeFresh}
          />
        ) : null}

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
              onConversationPersisted={() => {
                void loadConversations()
              }}
              onRequireAuth={openSignIn}
            />
          ) : null}
          {activePage === 'profile' ? (
            <ProfileScreen
              isDark={isDark}
              onToggleTheme={toggleTheme}
              onOpenAuth={(mode) => {
                setAuthMode(mode)
                setAuthOpen(true)
              }}
            />
          ) : null}
        </main>
      </div>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
      />
    </div>
  )
}
