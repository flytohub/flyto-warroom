const providerUnavailable = () =>
  Promise.reject(new Error('Firebase authentication is unavailable in this deployment'))

const enterpriseAuth = {
  currentUser: null,
  onAuthStateChanged() {
    throw new Error('Firebase authentication is unavailable in this deployment')
  },
  signInWithEmailAndPassword: providerUnavailable,
  createUserWithEmailAndPassword: providerUnavailable,
  signOut: providerUnavailable,
}

export function initializeApp(): Record<string, never> {
  return {}
}

export function getApps(): [] {
  return []
}

export function getApp(): Record<string, never> {
  return {}
}

export function getAuth(): typeof enterpriseAuth {
  return enterpriseAuth
}

export function onAuthStateChanged(): never {
  throw new Error('Firebase authentication is unavailable in this deployment')
}

export const signInWithPopup = providerUnavailable
export const linkWithPopup = providerUnavailable
export const signInWithRedirect = providerUnavailable
export const getRedirectResult = providerUnavailable
export const signInWithEmailAndPassword = providerUnavailable
export const createUserWithEmailAndPassword = providerUnavailable
export const sendPasswordResetEmail = providerUnavailable
export const sendEmailVerification = providerUnavailable
export const updateProfile = providerUnavailable
export const signOut = providerUnavailable

export class GoogleAuthProvider {}

export class GithubAuthProvider {
  addScope(_scope: string): void {}

  static credentialFromResult(_result: unknown): null {
    return null
  }

  static credentialFromError(_error: unknown): null {
    return null
  }
}

function compatAuth() {
  return enterpriseAuth
}

const compatFirebase = {
  apps: [] as unknown[],
  initializeApp,
  auth: compatAuth,
}

export default compatFirebase
