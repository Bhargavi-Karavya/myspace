import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authClient,
  clearAccessTokenCache,
  type AuthSession,
  type AuthUser,
} from './authClient'
import { clearChatCache } from './chatCache'

type AuthContextValue = {
  user: AuthUser | null
  session: AuthSession | null
  loading: boolean
  configured: boolean
  refreshSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = Boolean(import.meta.env.VITE_NEON_AUTH_URL)

  const refreshSession = useCallback(async () => {
    if (!configured) {
      setUser(null)
      setSession(null)
      setLoading(false)
      return
    }

    try {
      const result = await authClient.getSession()
      if (result.data?.session && result.data?.user) {
        setSession(result.data.session)
        setUser(result.data.user)
      } else {
        setSession(null)
        setUser(null)
      }
    } catch {
      setSession(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        return errorMessage(result.error, 'Unable to sign in')
      }
      await refreshSession()
      return null
    },
    [refreshSession],
  )

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      const result = await authClient.signUp.email({
        email,
        password,
        name: name?.trim() || email.split('@')[0] || 'User',
      })
      if (result.error) {
        return errorMessage(result.error, 'Unable to sign up')
      }
      await refreshSession()
      return null
    },
    [refreshSession],
  )

  const signInWithGoogle = useCallback(async () => {
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin,
      })
      return null
    } catch (error) {
      return errorMessage(error, 'Unable to start Google sign-in')
    }
  }, [])

  const signOut = useCallback(async () => {
    await authClient.signOut()
    clearAccessTokenCache()
    clearChatCache()
    setSession(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      configured,
      refreshSession,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [
      user,
      session,
      loading,
      configured,
      refreshSession,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
