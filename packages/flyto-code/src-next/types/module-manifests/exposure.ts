import { Building2, Crosshair, Gauge, Grid3x3, ListChecks, ShieldCheck, Sparkles } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const exposureModules = defineModulePackage('exposure', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'exposure',
  moat: 'none',
  licenseTier: 'community',
}, [
// Vulnerability Management was a separate nav entry that rendered the
  // SAME IssuesView pre-filtered to type=cve — a duplicate of Code Issues
  // with identical data. Removed 2026-06-11; the CVE-only lens is still
  // reachable via the Code Issues type filter, and old /vulnerabilities
  // bookmarks redirect to /issues (see route.tsx).

  // ── EXPOSURE ──────────────────────────────────────────────────
  {
    id: 'posture_overview',
    path: 'posture-overview',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PostureOverviewPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.postureOverview', fallback: 'Posture Overview', icon: Gauge },
  },
  {
    id: 'findings',
    path: 'findings',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/FindingsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.findings', fallback: 'Findings', icon: ListChecks },
  },
  {
    id: 'ctem_actions',
    path: 'ctem-actions',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CTEMActionsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.ctemActions', fallback: 'CTEM Actions', icon: Sparkles },
  },
  {
    id: 'attack_paths',
    path: 'attack-paths',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AttackPathsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.attack_paths', fallback: 'Attack Paths', icon: Crosshair },
  },
  {
    id: 'mitigations',
    path: 'mitigations',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/MitigationsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.mitigations', fallback: 'Mitigations', icon: ShieldCheck },
  },
  {
    id: 'vendor_risk',
    path: 'vendors',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VendorRiskPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.vendorRisk', fallback: 'Vendor Risk', icon: Building2 },
  },
  // 5×4 importance×severity risk matrix (evidence-gated good/bad cells,
  // honest zeros) — owned by the risk-matrix lane (RiskMatrixPage).
  // Gated on the backend `risk_matrix` page id (always-on; pageId derives
  // from the module id since no capability override is set).
  {
    id: 'risk_matrix',
    path: 'risk-matrix',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RiskMatrixPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.riskMatrix', fallback: 'Risk Matrix', icon: Grid3x3 },
  },
])
