import { Cloud, CloudCog } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const cloudModules = defineModulePackage('cloud', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'cloud',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── CLOUD ──────────────────────────────────────────────────────────
  // Ungated (like attack_paths / audit_timeline) so picking a Cloud (CSPM)
  // project actually surfaces a UI. Previously gated on the `cspm` capability,
  // which only the code_ctem_cspm tier grants — so selecting Cloud created a
  // project but the nav stayed hidden ("I picked cloud but there's no UI").
  // The pages carry honest empty states when there's no cloud data yet. The
  // proper per-org "project_type=cloud auto-grants cspm" capability work
  // remains an operator-side follow-up; this keeps the surface reachable now.
  {
    id: 'cloud_posture',
    path: 'cloud-posture',
    // Gate on the real backend page-id `cspm` (capabilities.yaml) — NOT the
    // module id. Without this, canSeePage('cloud_posture') checks a page that
    // doesn't exist and the item is denied once capabilities load. Cloud
    // Posture IS the CSPM surface.
    capability: 'cspm',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CloudPosturePage'),
    sidebar: { group: 'cloud', labelKey: 'nav.cloudPosture', fallback: 'Cloud Posture', icon: Cloud },
  },
  {
    id: 'cloud_findings',
    path: 'cloud-findings',
    capability: 'cspm',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CloudFindingsPage'),
    sidebar: { group: 'cloud', labelKey: 'nav.cloudFindings', fallback: 'CSPM Findings', icon: CloudCog },
  },
])
