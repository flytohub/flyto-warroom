import { HeartPulse } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const operationsModules = defineModulePackage('operations', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'operations',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── OPERATIONS (operator plane v1) ──────────────────────────────────
  // Gated on its own `operations` page id. Operator-side one-liner to
  // light it up: add `pages: { operations: { requires: [] } }` to
  // capabilities.yaml (visible to all org members; the system-wiring
  // panel self-gates to platform-admins via /events/scope). Until then
  // it's dark — same gated-then-enabled pattern as cloud.
  {
    id: 'operations',
    path: 'operations',
    // Operator plane (connector/scan/system health + SLA budget). Gated on the
    // `operations` page-id — an always-on page the backend now resolves into
    // visible_pages (capabilities.yaml, added 2026-06-04). Org-wide read view.
    capability: 'operations',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/OperationsPage'),
    sidebar: { group: 'operations', labelKey: 'nav.operations', fallback: 'Operations', icon: HeartPulse },
  },
])
