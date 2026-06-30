import type { ConnectedRepo, RepoHealthSummary } from '@lib/engine'

// Cross-surface display-scoring primitives moved to the neutral `_shared`
// layer (see _shared/scoring.ts). Re-exported here so dashboard-internal
// callers keep importing them from `./types` unchanged.
export { GRADE_COLORS, displayScore, gradeFor } from '@compounds/_shared/scoring'

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// --- Aggregated data from health summary ---
export interface DashboardData {
  healthRepos: RepoHealthSummary[]
  repos: ConnectedRepo[]
  domainIssueCount?: number
}

export interface ScanActivityItem {
  type: 'scan'
  title: string
  repo: string
  time: string
  grade: string
  score: number
}

export interface TopRisk {
  id: string
  repo?: ConnectedRepo
  grade: string
  score: number
}

export interface AggregatedData {
  avgScore: number
  avgGrade: string
  dist: Record<string, number>
  critical: number
  high: number
  medium: number
  atRisk: number
  secure: number
  scannedCount: number
  totalCount: number
  topRisks: TopRisk[]
  healthRepos: RepoHealthSummary[]
  scanActivity: ScanActivityItem[]
}
