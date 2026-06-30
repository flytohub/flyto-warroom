import { Globe, Server, Code2, Radar } from 'lucide-react'
import { t } from '@lib/i18n'
import type { AttackSurfaceAsset, PentestProject } from '@lib/engine'
import type { PRRef, PentestRef } from '@lib/engine'
import type { ExternalTargetScopeBucket } from '@lib/engine/code/pentest'

export interface DomainIssue {
  title: string
  desc: string
  severity: string
  authenticated?: boolean
  category?: 'frontend' | 'rest_api' | 'graphql' | 'attack_surface' | 'dns'
}

export interface DomainRow {
  domain: string
  url: string
  type: string
  project?: PentestProject
  /** Kernel resource_id when this row originates from a footprint /
   *  kernel-discovered domain (no PentestProject). It's the id the
   *  per-asset scan endpoint accepts — POST .../attack-surface/{id}/scan
   *  resolves kernel-first — so a footprint domain can be scanned without
   *  first being promoted to a project. Undefined for project-only rows. */
  resourceId?: string
  assets: AttackSurfaceAsset[]
  issues: DomainIssue[]
  lastScan: string
  /** Per-domain unified score from external-posture (backend is source
   *  of truth — frontend must NOT recompute). When undefined, this
   *  domain hasn't been scored yet (just-added, scan still running). */
  score?: number
  grade?: string
  /** Quarantined candidate score — non-undefined means the decision
   *  engine has seen a tier-2 delta and is waiting for a 2nd match
   *  before promoting. UI renders a "🔄 verifying" chip. */
  pending_score?: number
  pending_grade?: string
  /** Cross-dim context — populated when attack-surface is fetched with ?enrich=true */
  open_prs_touching?: PRRef[]
  pentest_verdict?: PentestRef | null
  blast_radius?: number
  /** Verification ledger status mirrored from asset_states.status via
   *  the bridge ("active" = confirmed, "inconclusive", "refuted").
   *  Customer-default rows are 'active'; 'inconclusive' renders with a
   *  question-mark chip; 'refuted' is hidden unless the operator
   *  toggles "show refuted". Default = 'active' when the asset
   *  predates the bridge (legacy rows). */
  verifierStatus?: 'active' | 'inconclusive' | 'refuted'
  scopeBucket?: ExternalTargetScopeBucket
  activeGateStatus?: string
  requiredAction?: string
}

export const SCOPE_LABELS: Record<string, string> = {
  core_owned: 'Core',
  owned_asset: 'Owned',
  vendor_operated: 'Vendor',
  external_context: 'Context',
  candidate: 'Candidate',
}

export const PROJECT_TYPES = [
  { id: 'frontend' as const, icon: Globe, color: '#38bdf8', nameKey: 'pentest.frontend', descKey: 'pentest.frontendDesc', staging: false },
  { id: 'rest_api' as const, icon: Server, color: '#f97316', nameKey: 'pentest.restApi', descKey: 'pentest.restApiDesc', staging: true },
  { id: 'graphql' as const, icon: Code2, color: '#e879f9', nameKey: 'pentest.graphql', descKey: 'pentest.graphqlDesc', staging: true },
  { id: 'attack_surface' as const, icon: Radar, color: '#22d3ee', nameKey: 'pentest.attackSurface', descKey: 'pentest.attackSurfaceDesc', staging: false },
]

// Domain layering
export const ENV_COLORS: Record<string, { color: string; label: string }> = {
  production:  { color: '#22c55e', label: 'Production' },
  staging:     { color: '#eab308', label: 'Staging' },
  development: { color: '#94a3b8', label: 'Development' },
  testing:     { color: '#3b82f6', label: 'Testing' },
}

export const ROLE_COLORS: Record<string, { color: string; label: string }> = {
  primary:   { color: '#a78bfa', label: 'Primary' },
  subscribe: { color: '#64748b', label: 'Subscribe' },
}

export const LIST_PAGE_SIZE = 6
export const DETAIL_PAGE_SIZE = 50
export const CHECKS_PAGE_SIZE = 50

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function sevBadge(sev: string) {
  const cls: Record<string, string> = { CRITICAL: 'dom-sev-crit', HIGH: 'dom-sev-high', MEDIUM: 'dom-sev-med', LOW: 'dom-sev-low' }
  const label: Record<string, string> = { CRITICAL: t('issues.critical'), HIGH: t('issues.high'), MEDIUM: t('issues.moderate'), LOW: t('issues.low') }
  return { cls: `dom-sev-badge ${cls[sev] ?? ''}`, label: label[sev] ?? sev }
}
