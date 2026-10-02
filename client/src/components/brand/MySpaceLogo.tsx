/** Brand mark — favicon for both themes. */
const FAVICON = '/brand/favicon.png'

type MySpaceLogoProps = {
  className?: string
  /** Show MySpace wordmark beside the favicon. */
  withWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Kept for API compatibility. */
  layout?: 'horizontal' | 'stacked'
  /** Kept for API compatibility. */
  variant?: 'badge' | 'plain'
}

const markSizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
} as const

const wordSizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
} as const

export function MySpaceLogo({
  className = '',
  withWordmark = true,
  size = 'md',
}: MySpaceLogoProps) {
  const mark = (
    <img
      src={FAVICON}
      alt=""
      className={`shrink-0 object-contain ${markSizes[size]}`}
      draggable={false}
    />
  )

  if (!withWordmark) {
    return (
      <span
        className={`inline-flex items-center ${className}`}
        role="img"
        aria-label="MySpace"
      >
        {mark}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      role="img"
      aria-label="MySpace"
    >
      {mark}
      <span
        className={`myspace-wordmark font-sans tracking-[-0.03em] ${wordSizes[size]}`}
        aria-hidden
      >
        <span className="font-medium">My</span>
        <span className="font-bold">Space</span>
      </span>
    </span>
  )
}
