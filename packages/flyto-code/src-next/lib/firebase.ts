import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { env } from './env'

// Initialize Firebase with whatever keys are present. When VITE_DEV_AUTH_BYPASS
// is on we may have no real Firebase config — fill in dummy values so the SDK
// doesn't throw on init. We never actually call auth methods in that mode.
const firebaseConfig = {
  apiKey: env.firebaseApiKey || 'dev-bypass-stub',
  authDomain: env.firebaseAuthDomain || 'localhost',
  projectId: env.firebaseProjectId || 'dev-bypass-stub',
}

// Avoid duplicate-app error when both src/ and src-next/ init Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
