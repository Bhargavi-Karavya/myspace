import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  LuCirclePlus,
  LuLogOut,
  LuMenu,
  LuMoon,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuSearch,
  LuSquarePen,
  LuSun,
  LuUser,
  LuX,
} from 'react-icons/lu'
import type { ConversationPreview } from '../../data/sampleConversations'
import { useAuth } from '../../lib/AuthProvider'
import {
  getPinnedConversationIds,
  togglePinnedConversationId,
} from '../../lib/pinnedConversations'
import { MySpaceLogo } from '../brand/MySpaceLogo'
import { IconButton } from '../ui/IconButton'
import { ConversationRow } from './ConversationRow'
import { SearchChatsModal } from './SearchChatsModal'

type AppSidebarProps = {
  open: boolean
  collapsed: boolean
  isMobile: boolean
  conversations: ConversationPreview[]
  conversationsLoading: boolean
  conversationsError: string | null
  activeConversationId: string | null
  onCloseMobile: () => void
  onToggleCollapsed: () => void
  onNewChat: () => void
  onOpenConversation: (conversation: ConversationPreview) => void
  onRenameConversation: (
    conversation: ConversationPreview,
    title: string,
  ) => Promise<void> | void
  onDeleteConversation: (conversation: ConversationPreview) => void
  onOpenProfile: () => void
  onSignIn: () => void
  onSignUp: () => void
}

type ConversationGroup = {
  label: string
  items: ConversationPreview[]
}

function groupConversations(
  conversations: ConversationPreview[],
): ConversationGroup[] {
  const buckets = new Map<string, ConversationPreview[]>()
  const order: string[] = []

  for (const conversation of conversations) {
    const label =
      conversation.updatedAt === 'Today' ||
      conversation.updatedAt === 'Yesterday'
        ? conversation.updatedAt
        : /^[A-Z][a-z]{2}$/.test(conversation.updatedAt)
          ? 'Previous 7 days'
          : 'Older'

    if (!buckets.has(label)) {
      buckets.set(label, [])
      order.push(label)
    }
    buckets.get(label)!.push(conversation)
  }

  const preferred = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
  order.sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b))

  return order.map((label) => ({
    label,
    items: buckets.get(label) ?? [],
  }))
}

export function AppSidebar({
  open,
  collapsed,
  isMobile,
  conversations,
  conversationsLoading,
  conversationsError,
  activeConversationId,
  onCloseMobile,
  onToggleCollapsed,
  onNewChat,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  onOpenProfile,
  onSignIn,
  onSignUp: _onSignUp,
}: AppSidebarProps) {
  const { user, loading, signOut } = useAuth()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const showCollapsed = collapsed && !isMobile

  useEffect(() => {
    if (!user?.id) {
      setPinnedIds([])
      return
    }
    setPinnedIds(getPinnedConversationIds(user.id))
  }, [user?.id])

  useEffect(() => {
    if (!isMobile || !open) return
    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !searchOpen) onCloseMobile()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile, open, onCloseMobile, searchOpen])

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  const pinnedConversations = useMemo(
    () => conversations.filter((c) => pinnedSet.has(c.id)),
    [conversations, pinnedSet],
  )

  const unpinnedConversations = useMemo(
    () => conversations.filter((c) => !pinnedSet.has(c.id)),
    [conversations, pinnedSet],
  )

  const groups = useMemo(
    () => groupConversations(unpinnedConversations),
    [unpinnedConversations],
  )

  const displayName =
    user?.name?.trim() ||
    (typeof user?.email === 'string' ? user.email.split('@')[0] : null) ||
    'Account'

  function handleNewChat() {
    onNewChat()
    setSearchOpen(false)
    if (isMobile) onCloseMobile()
  }

  function openSearch() {
    setSearchOpen(true)
  }

  function handleTogglePin(conversationId: string) {
    if (!user?.id) return
    setPinnedIds(togglePinnedConversationId(user.id, conversationId))
  }

  const panel = (
    <aside
      id="myspace-sidebar"
      aria-labelledby={titleId}
      className={`sidebar-panel flex h-full flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] ${
        showCollapsed ? 'w-[4.5rem]' : 'w-[16.5rem]'
      } ${
        isMobile
          ? `fixed inset-y-0 left-0 z-40 max-w-[85vw] shadow-xl ${
              open ? 'translate-x-0' : '-translate-x-full'
            }`
          : 'relative shrink-0'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b border-[var(--border)] px-3 py-3 ${
          showCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {showCollapsed ? (
          <MySpaceLogo withWordmark={false} size="sm" />
        ) : (
          <>
            <h2 id={titleId} className="min-w-0">
              <MySpaceLogo size="sm" />
            </h2>
            <div className="flex items-center gap-0.5">
              {isMobile ? (
                <IconButton
                  ref={closeButtonRef}
                  label="Close sidebar"
                  onClick={onCloseMobile}
                >
                  <LuX size={18} strokeWidth={1.75} />
                </IconButton>
              ) : (
                <IconButton
                  label="Collapse sidebar"
                  onClick={onToggleCollapsed}
                >
                  <LuPanelLeftClose size={18} strokeWidth={1.75} />
                </IconButton>
              )}
            </div>
          </>
        )}
      </div>

      {user ? (
        <div className="px-2.5 pt-2.5">
          {showCollapsed ? (
            <div className="flex flex-col items-center gap-1">
              <IconButton label="New chat" onClick={handleNewChat}>
                <LuSquarePen size={18} strokeWidth={1.85} />
              </IconButton>
              <IconButton label="Search chats" onClick={openSearch}>
                <LuSearch size={18} strokeWidth={1.85} />
              </IconButton>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleNewChat}
                aria-label="New chat"
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--fg)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <LuSquarePen size={16} strokeWidth={1.9} aria-hidden />
                <span className="truncate">New chat</span>
              </button>
              <button
                type="button"
                onClick={openSearch}
                aria-label="Search chats"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--fg)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <LuSearch size={16} strokeWidth={1.85} aria-hidden />
                <span>Search</span>
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!showCollapsed ? (
        <div
          className={`flex min-h-0 flex-1 flex-col px-2 ${user ? 'mt-3' : 'mt-2'}`}
        >
          <div className="scrollbar-myspace min-h-0 flex-1 overflow-y-auto pb-2">
            {!user && !loading ? null : conversationsLoading || loading ? (
              <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">
                Loading…
              </p>
            ) : conversationsError ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-red-500">
                {conversationsError}
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-3 text-sm leading-relaxed text-[var(--fg-muted)]">
                No saved chats yet. Start a new conversation.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {pinnedConversations.length > 0 ? (
                  <section aria-label="Pinned">
                    <h3 className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--fg-muted)] uppercase">
                      Pinned
                    </h3>
                    <ul className="flex flex-col gap-0.5">
                      {pinnedConversations.map((conversation) => (
                        <ConversationRow
                          key={conversation.id}
                          conversation={conversation}
                          active={conversation.id === activeConversationId}
                          pinned
                          onOpen={() => {
                            onOpenConversation(conversation)
                            if (isMobile) onCloseMobile()
                          }}
                          onTogglePin={() => handleTogglePin(conversation.id)}
                          onRename={(title) =>
                            onRenameConversation(conversation, title)
                          }
                          onDelete={() => onDeleteConversation(conversation)}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h3 className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--fg-muted)] uppercase">
                      {group.label}
                    </h3>
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((conversation) => (
                        <ConversationRow
                          key={conversation.id}
                          conversation={conversation}
                          active={conversation.id === activeConversationId}
                          pinned={false}
                          onOpen={() => {
                            onOpenConversation(conversation)
                            if (isMobile) onCloseMobile()
                          }}
                          onTogglePin={() => handleTogglePin(conversation.id)}
                          onRename={(title) =>
                            onRenameConversation(conversation, title)
                          }
                          onDelete={() => onDeleteConversation(conversation)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-center gap-1 px-2">
          <IconButton label="Expand sidebar" onClick={onToggleCollapsed}>
            <LuPanelLeftOpen size={18} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}

      <div
        className={`mt-auto border-t border-[var(--border)] ${
          showCollapsed ? 'flex flex-col items-center p-2' : 'p-3'
        }`}
      >
        {user || loading ? (
          <div
            className={`space-y-1 ${showCollapsed ? 'flex flex-col items-center' : ''}`}
          >
            {loading ? (
              <p className="px-2.5 py-2 text-xs text-[var(--fg-muted)]">…</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onOpenProfile()
                    if (isMobile) onCloseMobile()
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--fg)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    showCollapsed ? 'justify-center px-0' : ''
                  }`}
                  aria-label={`Account: ${displayName}`}
                >
                  <LuUser size={16} strokeWidth={1.75} />
                  {showCollapsed ? null : (
                    <span className="min-w-0 flex-1 truncate">{displayName}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    showCollapsed ? 'justify-center px-0' : ''
                  }`}
                  aria-label="Log out"
                >
                  <LuLogOut size={16} strokeWidth={1.75} />
                  {showCollapsed ? null : <span>Log out</span>}
                </button>
              </>
            )}
          </div>
        ) : showCollapsed ? (
          <IconButton
            label="Log in"
            onClick={() => {
              onSignIn()
            }}
            className="border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)]"
          >
            <LuUser size={18} strokeWidth={1.85} />
          </IconButton>
        ) : (
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-sm font-semibold tracking-[-0.015em] text-[var(--fg)]">
                Get responses tailored to you
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                Log in to get answers based on saved chats and your personal
                memory.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSignIn()
                if (isMobile) onCloseMobile()
              }}
              className="flex w-full items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_70%,transparent)] px-4 py-2 text-sm font-semibold tracking-[-0.01em] text-[var(--fg)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Log in
            </button>
          </div>
        )}
      </div>
    </aside>
  )

  if (!isMobile) {
    return (
      <>
        {panel}
        <SearchChatsModal
          open={searchOpen}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onClose={() => setSearchOpen(false)}
          onSelect={(conversation) => {
            onOpenConversation(conversation)
          }}
          onNewChat={handleNewChat}
        />
      </>
    )
  }

  return (
    <>
      <div
        className={`drawer-backdrop fixed inset-0 z-30 bg-black/40 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
        onClick={onCloseMobile}
      />
      {panel}
      <SearchChatsModal
        open={searchOpen}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onClose={() => setSearchOpen(false)}
        onSelect={(conversation) => {
          onOpenConversation(conversation)
          onCloseMobile()
        }}
        onNewChat={handleNewChat}
      />
    </>
  )
}

export function MobileChatHeader({
  onOpenSidebar,
  onNewChat,
  showGuestAuth,
  onSignIn,
  onToggleTheme,
  isDark,
}: {
  onOpenSidebar: () => void
  onNewChat: () => void
  showGuestAuth?: boolean
  onSignIn?: () => void
  onToggleTheme: () => void
  isDark: boolean
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg)] px-2 md:hidden">
      <IconButton label="Open menu" onClick={onOpenSidebar}>
        <LuMenu size={18} strokeWidth={1.75} />
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <MySpaceLogo size="sm" />
      </div>
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
      {showGuestAuth && onSignIn ? (
        <button
          type="button"
          onClick={onSignIn}
          className="rounded-full bg-[var(--fg)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Log in
        </button>
      ) : (
        <IconButton label="New chat" onClick={onNewChat}>
          <LuCirclePlus size={20} strokeWidth={1.85} />
        </IconButton>
      )}
    </header>
  )
}

export function GuestAuthHeader({
  onSignIn,
  onSignUp,
  onToggleTheme,
  isDark,
}: {
  onSignIn: () => void
  onSignUp: () => void
  onToggleTheme: () => void
  isDark: boolean
}) {
  return (
    <header className="hidden h-14 shrink-0 items-center justify-end gap-2 px-4 md:flex">
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
      <button
        type="button"
        onClick={onSignIn}
        className="rounded-full bg-[var(--fg)] px-4 py-2 text-sm font-semibold tracking-[-0.01em] text-[var(--bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Log in
      </button>
      <button
        type="button"
        onClick={onSignUp}
        className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)] px-4 py-2 text-sm font-semibold tracking-[-0.01em] text-[var(--fg)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Sign up for free
      </button>
    </header>
  )
}

export function DesktopChatHeader({
  title,
  onToggleTheme,
  isDark,
  onNewChat,
}: {
  title?: string
  onToggleTheme: () => void
  isDark: boolean
  onNewChat?: () => void
}) {
  return (
    <header className="hidden h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 md:flex">
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--fg)]">
        {title || 'New chat'}
      </h1>
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
      {onNewChat ? (
        <IconButton label="New chat" onClick={onNewChat}>
          <LuCirclePlus size={20} strokeWidth={1.85} />
        </IconButton>
      ) : null}
    </header>
  )
}
