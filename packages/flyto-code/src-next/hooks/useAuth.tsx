import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  linkWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '@lib/firebase'
import { env } from '@lib/env'
import { GITLAB_TOKEN_KEY } from '@lib/oauth'
import type { ReactNode } from 'react'

/** DEV-only: a fake FirebaseUser. Wrapped in a helper that ONLY gets called
 *  from inside `if (import.meta.env.DEV && env.devAuthBypass)` blocks so
 *  Vite/terser dead-code-eliminates everything below in a prod build. */
function makeDevUser(): FirebaseUser {
  if (!import.meta.env.DEV) throw new Error('dev-only')
  const devUser = {
    uid: env.devAuthUid,
    email: env.devAuthEmail,
    displayName: 'Dev User',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: '',
    tenantId: null,
    metadata: {},
    phoneNumber: null,
    providerId: 'dev',
    async getIdToken() {
      const header = btoa(JSON.stringify({ alg: 'none' }))
        .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
      const payload = btoa(JSON.stringify({
        sub: env.devAuthUid, email: env.devAuthEmail,
      })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
      return `${header}.${payload}.`
    },
    getIdTokenResult: async () => ({}),
    reload: async () => {},
    delete: async () => {},
    toJSON: () => ({}),
  } as unknown as FirebaseUser
  return devUser
}

export interface AuthState {
  user: FirebaseUser | null
  loading: boolean
  gitlabToken: string | null  // kept for GitLab PKCE callback flow only
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  /** OAuth popup → returns the real token for saveOrgToken (not stored locally) */
  connectGitHub: () => Promise<string | null>
  setGitLabToken: (token: string | null) => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(
    () => (import.meta.env.DEV && env.devAuthBypass ? makeDevUser() : null),
  )
  const [loading, setLoading] = useState(
    !(import.meta.env.DEV && env.devAuthBypass),
  )
  // GitHub connection state is now managed by useGitHubConnection (queries engine)
  const [gitlabToken, setGitlabTokenState] = useState<string | null>(
    () => sessionStorage.getItem(GITLAB_TOKEN_KEY),
  )

  function setGitLabToken(token: string | null) {
    if (token) sessionStorage.setItem(GITLAB_TOKEN_KEY, token)
    else sessionStorage.removeItem(GITLAB_TOKEN_KEY)
    setGitlabTokenState(token)
  }

  useEffect(() => {
    // Skip the Firebase listener entirely when dev bypass is on — the initial
    // state already reflects the fake user and firebase init may also be
    // mocked out in this mode. Guard with import.meta.env.DEV so the check
    // constant-folds to false in prod and this effect always subscribes.
    if (import.meta.env.DEV && env.devAuthBypass) return
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      setUser(null)
      setLoading(false)
    }, 5_000)
    const unsub = onAuthStateChanged(auth, (u) => {
      settled = true
      window.clearTimeout(timeout)
      setUser(u)
      setLoading(false)
    }, (err) => {
      settled = true
      window.clearTimeout(timeout)
      setUser(null)
      setLoading(false)
      if (import.meta.env.DEV) console.error('Firebase auth state failed:', err)
    })
    return () => {
      settled = true
      window.clearTimeout(timeout)
      unsub()
    }
  }, [])

  // Global 401 handler — when the engine returns 401 (expired/revoked
  // token), the API client dispatches 'flyto:auth-expired'. We listen
  // here and force sign-out so the user lands on /login cleanly instead
  // of seeing scattered per-component errors.
  //
  // Cross-tab sync: BroadcastChannel notifies other tabs so they sign
  // out simultaneously instead of showing stale data for up to 30s.
  useEffect(() => {
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('flyto:auth') : null

    const doSignOut = () => {
      firebaseSignOut(auth).catch(() => {})
      sessionStorage.removeItem(GITLAB_TOKEN_KEY)
      setGitlabTokenState(null)
      setUser(null)
      setLoading(false)
    }

    const handler = () => {
      doSignOut()
      bc?.postMessage('signed-out')
    }

    const onBroadcast = (e: MessageEvent) => {
      if (e.data === 'signed-out') doSignOut()
    }

    window.addEventListener('flyto:auth-expired', handler)
    bc?.addEventListener('message', onBroadcast)
    return () => {
      window.removeEventListener('flyto:auth-expired', handler)
      bc?.removeEventListener('message', onBroadcast)
      bc?.close()
    }
  }, [])

  // Check redirect result on mount (for connectGitHub redirect flow)
  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (!result) return
      GithubAuthProvider.credentialFromResult(result)
      // Token from redirect is handled by the caller (IntegrationsTab/Onboarding)
      // via connectGitHub() return value → saveOrgToken()
    }).catch((err) => {
      if (import.meta.env.DEV) console.error('Redirect result error:', err)
    })
  }, [])

  /** Return the token for saving to engine (no local storage) */
  function passGitHubToken(accessToken: string): string {
    return accessToken
  }

  async function handleGitHubPopup() {
    const provider = new GithubAuthProvider()
    provider.addScope('repo')
    provider.addScope('read:user')
    // Required so /user/orgs returns the user's GitHub orgs (e.g. `flytohub`).
    // Without it the repo picker falls back to personal-account repos only.
    provider.addScope('read:org')
    const result = await signInWithPopup(auth, provider)
    setUser(result.user)
    setLoading(false)
    const credential = GithubAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
      passGitHubToken(credential.accessToken)
    }
  }

  async function handleConnectGitHub(): Promise<string | null> {
    const provider = new GithubAuthProvider()
    provider.addScope('repo')
    provider.addScope('read:user')
    provider.addScope('read:org')

    const currentUser = auth.currentUser

    // Try linkWithPopup first (adds GitHub to current account)
    // If that fails for any credential reason, extract token from the error
    if (currentUser) {
      try {
        const result = await linkWithPopup(currentUser, provider)
        const credential = GithubAuthProvider.credentialFromResult(result)
        if (credential?.accessToken) {
          passGitHubToken(credential.accessToken)
          return credential.accessToken
        }
      } catch (err: unknown) {
        const firebaseErr = err as { code?: string }
        if (firebaseErr.code === 'auth/popup-closed-by-user' || firebaseErr.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider)
          return null // redirect resumes from useEffect on mount
        }
        // Extract token from error — Firebase includes the credential even on failure
        const credential = GithubAuthProvider.credentialFromError(err as Parameters<typeof GithubAuthProvider.credentialFromError>[0])
        if (credential?.accessToken) {
          passGitHubToken(credential.accessToken)
          return credential.accessToken
        }
        // If no token in error, try signInWithPopup as last resort
        if (firebaseErr.code === 'auth/credential-already-in-use' ||
            firebaseErr.code === 'auth/email-already-in-use' ||
            firebaseErr.code === 'auth/provider-already-linked') {
          const result = await signInWithPopup(auth, provider)
          const cred = GithubAuthProvider.credentialFromResult(result)
          if (cred?.accessToken) {
            passGitHubToken(cred.accessToken)
            return cred.accessToken
          }
        }
        throw err
      }
    } else {
      const result = await signInWithPopup(auth, provider)
      const credential = GithubAuthProvider.credentialFromResult(result)
      if (credential?.accessToken) {
        passGitHubToken(credential.accessToken)
        return credential.accessToken
      }
    }
    return null
  }

  const value: AuthState = {
    user,
    loading,
    gitlabToken,
    signInWithGoogle: async () => {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider())
      setUser(cred.user)
      setLoading(false)
    },
    signInWithGithub: handleGitHubPopup,
    connectGitHub: handleConnectGitHub,
    setGitLabToken,
    signInWithEmail: async (email, password) => {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      setUser(cred.user)
      setLoading(false)
    },
    signUpWithEmail: async (email, password, displayName) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName })
      await sendEmailVerification(cred.user).catch(() => {
        // Best-effort — don't block sign-up if verification email fails.
        // User can resend from profile settings later.
      })
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email)
    },
    signOut: async () => {
      sessionStorage.removeItem(GITLAB_TOKEN_KEY)
      setGitlabTokenState(null)
      // Purge per-user app caches so the next login on the same browser
      // doesn't see the previous user's red-team campaigns / pipeline
      // snapshots / fleet state. Keys are prefixed `flyto_` and
      // `flyto_pipeline_` per the persistence layers.
      try {
        const drop: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && (k.startsWith('flyto_') || k.startsWith('flyto-'))) {
            drop.push(k)
          }
        }
        for (const k of drop) localStorage.removeItem(k)
      } catch { /* private mode / quota — no-op */ }
      await firebaseSignOut(auth)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Re-exported from this file for convenience; defined here to co-locate with context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
