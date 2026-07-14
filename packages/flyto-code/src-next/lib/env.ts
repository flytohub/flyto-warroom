// DEV-ONLY. Never set in production builds — vite replaces import.meta.env.DEV
// with `false` in a prod build and tree-shakes the branches below.
// When VITE_DEV_AUTH_BYPASS=1, login is skipped and the engine client sends a
// deterministic dev JWT that flyto-engine's FLYTO_DEV_AUTH=1 accepts.
const devAuthBypass =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === '1'

// requireProdEnv returns the env-var value, falling back to devFallback in
// dev only. In a prod build (import.meta.env.DEV === false) an unset var
// throws at module load — better the bundle crashes immediately than silently
// pointing every API call at localhost. CI / Cloud Run that forgot to set
// the var will fail the deploy, not the user's first session.
function requireProdEnv(key: string, devFallback: string): string {
  const v = import.meta.env[key] as string | undefined
  if (v) return v
  if (import.meta.env.DEV) return devFallback
  throw new Error(
    `${key} is required in production builds; set it in your deploy config or fall back to a dev build for local work.`,
  )
}

export function normalizeEngineUrl(value: string): string {
  return value === '__same_origin__' ? '' : value
}

export const env = {
  authMode: ((import.meta.env.VITE_AUTH_MODE as string) || 'firebase').toLowerCase(),
  githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID as string,
  gitlabClientId: import.meta.env.VITE_GITLAB_CLIENT_ID as string,
  gitlabBaseUrl: (import.meta.env.VITE_GITLAB_BASE_URL as string) || 'https://gitlab.com',
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  engineUrl: normalizeEngineUrl(requireProdEnv('VITE_ENGINE_URL', 'http://localhost:8080')),
  automationUrl: import.meta.env.DEV
    ? '/cloud-api'  // Vite proxy — bypasses CORS in dev
    : requireProdEnv('VITE_AUTOMATION_URL', 'https://cloud.flyto2.com'),
  cortexUrl: requireProdEnv('VITE_CORTEX_URL', 'https://cortex.flyto2.com'),
  devAuthBypass,
  devAuthUid: (import.meta.env.VITE_DEV_AUTH_UID as string) || 'test-uid-1',
  devAuthEmail: (import.meta.env.VITE_DEV_AUTH_EMAIL as string) || 'dev@flyto2.com',
} as const
