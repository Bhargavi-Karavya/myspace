import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LuEllipsis,
  LuMessageSquare,
  LuPencil,
  LuPin,
  LuPinOff,
  LuTrash2,
} from 'react-icons/lu'
import type { ConversationPreview } from '../../data/sampleConversations'

type ConversationRowProps = {
  conversation: ConversationPreview
  active: boolean
  pinned: boolean
  onOpen: () => void
  onTogglePin: () => void
  onRename: (title: string) => Promise<void> | void
  onDelete: () => void
}

export function ConversationRow({
  conversation,
  active,
  pinned,
  onOpen,
  onTogglePin,
  onRename,
  onDelete,
}: ConversationRowProps) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(conversation.title)
  const [saving, setSaving] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!renaming) {
      setDraftTitle(conversation.title)
    }
  }, [conversation.title, renaming])

  useEffect(() => {
    if (!renaming) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [renaming])

  useEffect(() => {
    if (!menuOpen) return

    function placeMenu() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 188
      const left = Math.min(
        rect.right - width,
        window.innerWidth - width - 8,
      )
      const top = Math.min(rect.bottom + 4, window.innerHeight - 8)
      setMenuPos({
        top: Math.max(8, top),
        left: Math.max(8, left),
      })
    }

    placeMenu()

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      setMenuOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function commitRename() {
    const next = draftTitle.trim().replace(/\s+/g, ' ')
    if (!next || next === conversation.title) {
      setDraftTitle(conversation.title)
      setRenaming(false)
      return
    }

    setSaving(true)
    try {
      await onRename(next)
      setRenaming(false)
    } catch {
      setDraftTitle(conversation.title)
      setRenaming(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="group/chat relative">
      <div
        className={`flex w-full items-center rounded-lg transition-colors ${
          active || renaming
            ? 'bg-[var(--bg-elevated)]'
            : 'hover:bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)]'
        }`}
      >
        {renaming ? (
          <form
            className="min-w-0 flex-1 px-1.5 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              void commitRename()
            }}
          >
            <input
              ref={inputRef}
              value={draftTitle}
              disabled={saving}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => {
                void commitRename()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setDraftTitle(conversation.title)
                  setRenaming(false)
                }
              }}
              aria-label="Rename chat"
              className="w-full rounded-md border border-[var(--accent)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--fg)] outline-none shadow-[0_0_0_2px_var(--composer-ring)]"
            />
          </form>
        ) : (
          <>
            <button
              type="button"
              title={conversation.title}
              onClick={onOpen}
              className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                active ? 'font-medium text-[var(--fg)]' : 'text-[var(--fg)]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="inline-flex max-w-full items-center gap-2.5">
                <LuMessageSquare
                  size={16}
                  strokeWidth={1.85}
                  className="shrink-0 text-[var(--fg-muted)]"
                  aria-hidden
                />
                <span className="truncate">{conversation.title}</span>
              </span>
            </button>

            <button
              ref={triggerRef}
              type="button"
              aria-label={`Chat options for ${conversation.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen((value) => !value)
              }}
              className={`mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--fg-muted)] transition-[opacity,background-color,color] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
                menuOpen
                  ? 'opacity-100'
                  : 'opacity-100 md:opacity-0 md:group-hover/chat:opacity-100 md:focus-visible:opacity-100'
              }`}
            >
              <LuEllipsis size={16} strokeWidth={2} />
            </button>
          </>
        )}
      </div>

      {menuOpen && !renaming && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Chat options"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-[60] w-[11.75rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[0_12px_40px_color-mix(in_srgb,var(--fg)_18%,transparent)]"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--fg)] transition-colors hover:bg-[var(--bg-soft)] focus-visible:bg-[var(--bg-soft)] focus-visible:outline-none"
                onClick={() => {
                  setMenuOpen(false)
                  setDraftTitle(conversation.title)
                  setRenaming(true)
                }}
              >
                <LuPencil size={15} strokeWidth={1.85} />
                <span>Rename</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--fg)] transition-colors hover:bg-[var(--bg-soft)] focus-visible:bg-[var(--bg-soft)] focus-visible:outline-none"
                onClick={() => {
                  onTogglePin()
                  setMenuOpen(false)
                }}
              >
                {pinned ? (
                  <LuPinOff size={15} strokeWidth={1.85} />
                ) : (
                  <LuPin size={15} strokeWidth={1.85} />
                )}
                <span>{pinned ? 'Unpin chat' : 'Pin chat'}</span>
              </button>

              <div
                className="my-1 border-t border-[var(--border)]"
                role="separator"
              />

              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#e35d6a] transition-colors hover:bg-[color-mix(in_srgb,#e35d6a_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,#e35d6a_12%,transparent)] focus-visible:outline-none"
                onClick={() => {
                  onDelete()
                  setMenuOpen(false)
                }}
              >
                <LuTrash2 size={15} strokeWidth={1.85} />
                <span>Delete</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </li>
  )
}
