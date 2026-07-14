import { BarChart3, GitFork, Scale } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const scoringModules = defineModulePackage('scoring', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'scoring',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── SCORING ───────────────────────────────────────────────────
  // ScoringView (the Bitsight-style category breakdown + weight donut
  // + methodology) was orphaned during the Phase 3 module-manifest
  // refactor — sectionRegistry kept it at `scoring-overview` but no
  // top-level route picked it up. Restored 2026-05-22 (operator:
  // "之前不是有一個評分表嗎 怎麼不見了").
  {
    id: 'scoring',
    path: 'scoring',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ScoringPage'),
    sidebar: { group: 'scoring', labelKey: 'nav.scoringOverview', fallback: 'Scoring Overview', icon: BarChart3 },
  },
  {
    id: 'score_trends',
    path: 'score-trends',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ScoreTrendsPage'),
    sidebar: { group: 'scoring', labelKey: 'nav.scoreTrends', fallback: 'Score Trends', icon: GitFork },
  },
  {
    id: 'compliance',
    path: 'compliance',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CompliancePage'),
    sidebar: { group: 'scoring', labelKey: 'nav.compliance', fallback: 'Compliance', icon: Scale },
  },
])
