import { createAuthClient } from '@neondatabase/neon-js/auth'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined

if (!authUrl && import.meta.env.DEV) {
  console.warn(
    '[auth] VITE_NEON_AUTH_URL is not set. Copy it from Neon Console → Auth → Configuration into client/.env',
  )
}

/**
 * Cross-origin SPA (Vite on localhost) → Neon Auth host needs the session cookie.
 * Without credentials, /token cannot mint a JWT.
 * @see https://neon.com/docs/auth/guides/plugins/jwt
 */
export const authClient = createAuthClient(authUrl ?? '', {
  // Cross-origin session cookies for /token (Neon JWT docs).
  // Typed loosely: NeonAuthConfig typings omit fetchOptions today.
  ...({
    fetchOptions: {
      credentials: 'include',
    },
  } as object),
})

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>['data']
>['session']

export type AuthUser = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>['data']
>['user']

/** Cached Neon Auth JWT (from /token or set-auth-jwt). Not the opaque session token. */
let cachedJwt: { token: string; expiresAtMs: number } | null = null

const TOKEN_FETCH_TIMEOUT_MS = 10_000

/**
 * Neon Auth JWTs are compact JWS (three base64url segments).
 * Session cookies use an opaque `session.token` like `L0tKdf4n...` — never send that as Bearer.
 */
export function isJwtAccessToken(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every((part) => part.length > 0)
}

function cacheJwt(token: string) {
  if (!isJwtAccessToken(token)) return

  // Prefer exp from payload; default to 14 minutes (Neon JWTs expire in 15m).
  let expiresAtMs = Date.now() + 14 * 60 * 1000
  try {
    const payloadJson = atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(payloadJson) as { exp?: number }
    if (typeof payload.exp === 'number') {
      expiresAtMs = payload.exp * 1000 - 30_000
    }
  } catch {
    // keep default TTL
  }

  cachedJwt = { token, expiresAtMs }
}

function getCachedJwt(): string | null {
  if (!cachedJwt) return null
  if (Date.now() >= cachedJwt.expiresAtMs) {
    cachedJwt = null
    return null
  }
  return cachedJwt.token
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * GET {NEON_AUTH_URL}/token with session cookies → `{ token: "<JWT>" }`.
 */
async function fetchJwtFromTokenEndpoint(): Promise<string | null> {
  if (!authUrl) return null

  const response = await fetchWithTimeout(
    `${authUrl.replace(/\/$/, '')}/token`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
    TOKEN_FETCH_TIMEOUT_MS,
  )

  if (!response.ok) {
    console.warn('[auth] /token failed', { status: response.status })
    return null
  }

  const body = (await response.json().catch(() => null)) as {
    token?: unknown
  } | null
  const token = body?.token
  if (typeof token === 'string' && isJwtAccessToken(token)) {
    cacheJwt(token)
    return token
  }

  console.warn('[auth] /token response did not include a JWT')
  return null
}

/**
 * getSession often returns JWT in the `set-auth-jwt` response header (not in JSON body).
 * JSON `session.token` is the opaque session id — do not use it as Bearer.
 */
async function fetchJwtFromSessionHeader(): Promise<string | null> {
  let headerJwt: string | null = null

  await authClient.getSession({
    fetchOptions: {
      onSuccess: (ctx: { response?: Response }) => {
        const jwt = ctx.response?.headers?.get('set-auth-jwt')
        if (typeof jwt === 'string' && isJwtAccessToken(jwt)) {
          headerJwt = jwt
          cacheJwt(jwt)
        }
      },
    },
  })

  return headerJwt
}

/**
 * Neon Auth JWT for MySpace API `Authorization: Bearer` headers.
 *
 * Never returns the opaque Better Auth session token from get-session JSON.
 */
export async function getAccessToken(): Promise<string | null> {
  const cached = getCachedJwt()
  if (cached) return cached

  try {
    const fromTokenEndpoint = await fetchJwtFromTokenEndpoint()
    if (fromTokenEndpoint) return fromTokenEndpoint
  } catch (error) {
    console.warn('[auth] /token request failed', error)
  }

  try {
    const fromHeader = await fetchJwtFromSessionHeader()
    if (fromHeader) return fromHeader
  } catch (error) {
    console.warn('[auth] getSession JWT header capture failed', error)
  }

  return null
}

export function clearAccessTokenCache(): void {
  cachedJwt = null
}
