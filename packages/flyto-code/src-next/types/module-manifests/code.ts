import { Boxes, ClipboardCheck, Radar, ScanLine, Shield, Wand2 } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const codeModules = defineModulePackage('code', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'code',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── CODE ──────────────────────────────────────────────────────
  {
    id: 'issues',
    path: 'issues',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IssuesPage'),
    sidebar: { group: 'code', labelKey: 'nav.codeIssues', fallback: 'Code Issues', icon: Shield, count: 'issues' },
  },
  {
    id: 'pentest',
    path: 'pentest',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PentestPage'),
    sidebar: { group: 'code', labelKey: 'nav.pentest', fallback: 'Pentest', icon: Radar },
  },
  {
    id: 'product_verification',
    path: 'product-verification',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ProductVerificationPage'),
    sidebar: { group: 'code', labelKey: 'nav.productVerification', fallback: 'Product Verification', icon: ClipboardCheck },
  },
  {
    id: 'autofix',
    path: 'autofix',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AutofixPage'),
    sidebar: { group: 'code', labelKey: 'nav.autofix', fallback: 'AutoFix', icon: Wand2, count: 'autofix' },
  },
  // Architecture + Code Scans — the two deep technical surfaces that
  // used to live in the legacy below-the-divider war-room accordion.
  // Promoted to first-class modules 2026-06-05 (accordion removed,
  // single modern sidebar). Splat path carries the deep sub-section id
  // (/architecture/arch-deps) so each technical view deep-links; the
  // render engine is still WarRoomView + sectionRegistry. Capability
  // gate = the existing backend `warroom_architecture` / `warroom_security`
  // page ids (both require code_audit) — kept so old /warroom/:id
  // bookmarks and backend aliases keep resolving.
  {
    id: 'architecture',
    path: 'architecture/*',
    capability: 'warroom_architecture',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ArchitecturePage'),
    sidebar: { group: 'code', labelKey: 'section.architecture', fallback: 'Architecture', icon: Boxes },
  },
  {
    id: 'code-scans',
    path: 'code-scans/*',
    capability: 'warroom_security',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CodeScansPage'),
    sidebar: { group: 'code', labelKey: 'section.codeScans', fallback: 'Code Scans', icon: ScanLine },
  },
  {
    // Container security — Trivy image + base-image CVEs. First-classed
    // out of the war-room Code Scans accordion. Gated on the `containers`
    // page id (NOT the `code_audit` feature — canSeePage checks pages, not
    // features); the backend only puts `containers` in visible_pages for
    // code-entitled orgs, so it stays hidden for external-only orgs.
    id: 'containers',
    path: 'containers',
    capability: 'containers',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ContainersPage'),
    sidebar: { group: 'code', labelKey: 'nav.containers', fallback: 'Containers', icon: Boxes },
  },
])
