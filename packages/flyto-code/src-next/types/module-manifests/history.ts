import { Clock, History } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const historyModules = defineModulePackage('history', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'history',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── HISTORY ───────────────────────────────────────────────────
  {
    id: 'audit_timeline',
    path: 'audit-timeline',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AuditTimelinePage'),
    sidebar: { group: 'history', labelKey: 'nav.auditTimeline', fallback: 'Audit Timeline', icon: Clock },
  },
  // Layered audit timeline (L1–L4) — the timeline-center surface owned
  // by the timeline lane (TimelineCenterPage). Always-on; gated on the
  // backend `timeline` page id (pageId derives from the module id since no
  // capability override is set), honest-empty when there's no history yet.
  {
    id: 'timeline',
    path: 'timeline',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/TimelineCenterPage'),
    sidebar: { group: 'history', labelKey: 'nav.timeline', fallback: 'Timeline', icon: History },
  },
])
