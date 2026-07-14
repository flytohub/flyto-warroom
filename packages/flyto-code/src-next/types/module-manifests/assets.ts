import { ClipboardCheck, GitBranch, Globe, MapPin } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const assetsModules = defineModulePackage('assets', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'assets',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── ASSETS ────────────────────────────────────────────────────
  {
    id: 'repos',
    path: 'repos',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ReposPage'),
    sidebar: { group: 'assets', labelKey: 'nav.repos', fallback: 'Repositories', icon: GitBranch, count: 'repos' },
  },
  {
    id: 'domains',
    path: 'domains',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DomainsPage'),
    sidebar: { group: 'assets', labelKey: 'nav.domains', fallback: 'Domains', icon: Globe, count: 'domains' },
  },
  {
    id: 'asset_map',
    path: 'asset-map',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AssetMapPage'),
    sidebar: { group: 'assets', labelKey: 'item.assetMap', fallback: 'Asset Map', icon: MapPin },
  },
  {
    id: 'asset_coverage',
    path: 'asset-coverage',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AssetCoveragePage'),
    sidebar: { group: 'assets', labelKey: 'nav.assetCoverage', fallback: 'Asset Coverage', icon: ClipboardCheck },
  },
])
