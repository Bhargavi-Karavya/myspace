type SuggestionChipProps = {
  label: string
  onSelect: (label: string) => void
  disabled?: boolean
}

export function SuggestionChip({
  label,
  onSelect,
  disabled = false,
}: SuggestionChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(label)}
      className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] px-3.5 py-2 text-left text-sm font-medium text-[var(--fg)] backdrop-blur-sm transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {label}
    </button>
  )
}
