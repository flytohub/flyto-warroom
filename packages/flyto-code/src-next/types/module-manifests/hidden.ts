import { Network } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const hiddenModules = defineModulePackage('hidden', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'hidden',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── HIDDEN (routed but not in sidebar) ────────────────────────
  // Org chart — pulled from nav 2026-05-21 per operator
  // ("組織那一塊 就是架構圖 可以拔掉"). URL kept so direct
  // bookmarks survive.
  {
    id: 'org',
    path: 'org',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/OrgPage'),
    sidebar: { group: 'hidden', labelKey: 'nav.orgChart', fallback: 'Org Chart', icon: Network },
  },
  // Repo detail — drilled into from Repos list.
  {
    id: 'repo_detail',
    path: 'repos/:repoId',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RepoDetailPage'),
    // No sidebar entry — accessed via Repos list row click.
  },
])
