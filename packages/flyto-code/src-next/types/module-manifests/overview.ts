import { Activity, LayoutDashboard, ShieldCheck, Workflow } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const overviewModules = defineModulePackage('overview', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'overview',
  moat: 'none',
  licenseTier: 'community',
}, [
  // ── OVERVIEW ──────────────────────────────────────────────────
  // Legacy /exec route. Hidden from navigation; route.tsx redirects
  // the public URL back to /dashboard.
  {
    id: 'exec',
    path: 'exec',
    fullBleed: true,
    capability: 'dashboard',
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DashboardPage'),
    sidebar: { group: 'hidden', labelKey: 'nav.exec', fallback: 'Executive', icon: LayoutDashboard },
  },
  // Verdict-first homepage — the war-room landing view. Leads with
  // Verified Attack Paths + Verified Safe (red/green duality) +
  // MTTV/MTTR, NOT a single Bitsight score. The workspace index route
  // points here. Ungated (always-on, like dashboard).
  {
    id: 'verdict',
    path: 'verdict',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VerdictDashboardPage'),
    sidebar: { group: 'overview', labelKey: 'nav.verdict', fallback: 'Verdict', icon: ShieldCheck },
  },
  {
    id: 'dashboard',
    path: 'dashboard',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DashboardPage'),
    sidebar: { group: 'overview', labelKey: 'quick.dashboard', fallback: 'Dashboard', icon: LayoutDashboard },
  },
  {
    id: 'pulse',
    path: 'pulse',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PulsePage'),
    sidebar: { group: 'overview', labelKey: 'nav.pulse', fallback: 'Pulse', icon: Activity },
  },
  {
    id: 'footprint',
    path: 'footprint',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/FootprintPage'),
    sidebar: { group: 'overview', labelKey: 'nav.footprint', fallback: 'Footprint', icon: Workflow },
  },
])
