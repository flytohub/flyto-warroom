import { Fingerprint } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const identityModules = defineModulePackage('identity', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'identity',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── IDENTITY ────────────────────────────────────────────────────────
  // Bring-your-own-IdP surface; no Flyto2-native engine yet. Placeholder
  // page points the user at Settings → Integrations. Gated on the
  // `identity` page id — dark until the backend resolves it.
  {
    id: 'identity',
    path: 'identity',
    capability: 'identity',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IdentityPage'),
    sidebar: { group: 'identity', labelKey: 'nav.identity', fallback: 'Identity', icon: Fingerprint },
  },
])
