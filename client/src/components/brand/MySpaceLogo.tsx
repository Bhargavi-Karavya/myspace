import logoUrl from '../../assets/brand/myspace-logo.png'
import markUrl from '../../assets/brand/myspace-mark.png'

type MySpaceLogoProps = {
  className?: string
  /** Show the wordmark next to the mark. */
  withWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** horizontal = icon + wordmark row; stacked = icon above wordmark */
  layout?: 'horizontal' | 'stacked'
}

const markSizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
} as const

const fullLogoSizes = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
} as const

const wordSizes = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
} as const

export function MySpaceLogo({
  className = '',
  withWordmark = true,
  size = 'md',
  layout = 'horizontal',
}: MySpaceLogoProps) {
  const stacked = layout === 'stacked' && withWordmark

  if (withWordmark && !stacked) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        {/* Light: official lockup */}
        <img
          src={logoUrl}
          alt="MySpace"
          className={`${fullLogoSizes[size]} w-auto object-contain dark:hidden`}
          draggable={false}
        />
        {/* Dark: original-color mark + white wordmark (same overall size) */}
        <span className="hidden items-center gap-2.5 dark:inline-flex" aria-label="MySpace">
          <img
            src={markUrl}
            alt=""
            className={`shrink-0 object-contain ${markSizes[size]}`}
            draggable={false}
          />
          <span
            className={`font-sans tracking-[-0.03em] text-white ${wordSizes[size]}`}
            aria-hidden
          >
            <span className="font-medium">My</span>
            <span className="font-bold">Space</span>
          </span>
        </span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center ${
        stacked ? 'flex-col gap-2' : 'gap-2.5'
      } ${className}`}
    >
      <img
        src={markUrl}
        alt={withWordmark ? '' : 'MySpace'}
        className={`shrink-0 object-contain ${markSizes[size]}`}
        draggable={false}
      />
      {withWordmark ? (
        <span
          className={`font-sans tracking-[-0.03em] text-[var(--fg)] dark:text-white ${wordSizes[size]}`}
          aria-label="MySpace"
        >
          <span className="font-medium">My</span>
          <span className="font-bold">Space</span>
        </span>
      ) : null}
    </span>
  )
}
