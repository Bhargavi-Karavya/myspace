import type { ReactNode } from 'react'

type SuggestionChipProps = {
  label: string
  icon?: ReactNode
  onSelect: (label: string) => void
  disabled?: boolean
}

export function SuggestionChip({
  label,
  icon,
  onSelect,
  disabled = false,
}: SuggestionChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(label)}
      className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] py-2 pr-4 pl-2 text-left text-sm font-medium tracking-[-0.01em] text-[var(--fg)] shadow-[var(--shadow-sm)] transition-[background-color,border-color,transform,box-shadow] duration-150 hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:bg-[var(--bg-soft)] hover:enabled:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
    </button>
  )
}
