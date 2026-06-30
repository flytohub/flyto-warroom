// findingsByPackage.ts — Package-level aggregation.
//
// Backend: handlers_finding_by_package.go.
//   GET /api/v1/code/orgs/{id}/findings/by-package?pkg=axios&type=cve
//
// Use case: from any package-based finding row (CVE listings, dep
// view, autofix), drill into a unified per-package detail that
// joins findings across every repo touching that package +
// autofix patches + open PRs + verification history.

import { request } from '../client'

export interface PackageSubissue {
  cve_id?: string
  title: string
  severity: string
  version?: string
  fixed_in?: string
  status: string
  fingerprint: string
  file_path?: string
  published_at?: string
  references?: string[]
  reachable: boolean
  taint_categories?: string[]
}

export interface PackageRepoGroup {
  repo_id: string
  repo_name: string
  issues: PackageSubissue[]
}

export interface AutofixPatchInfo {
  rule_id: string
  category: string
  source_pattern: string
  target_pattern: string
  applies_to: string[]
}

export interface PRInfo {
  pr_number: number
  title: string
  state: string
  is_draft: boolean
  html_url: string
  author: string
  opened_at: string
}

export interface VerificationInfo {
  workflow_id: string
  status: string
  verdict: string
  ran_at: string
}

export interface PackageFinding {
  package: string
  type: string
  worst_severity: string
  issue_count: number
  repo_count: number

  title: string
  description: string

  fix_available: boolean
  fix_version?: string
  current_versions?: string[]

  repo_groups: PackageRepoGroup[]

  autofix_available: boolean
  autofix_patches?: AutofixPatchInfo[]
  blast_radius: number
  open_prs?: PRInfo[]
  verifications?: VerificationInfo[]
  latest_verdict?: string

  taint_categories?: string[]
  unsanitized_flows: number

  status_counts: Record<string, number>
}

export function getFindingByPackage(
  orgId: string,
  pkg: string,
  type: string = 'cve',
) {
  const qs = new URLSearchParams({ pkg, type })
  return request<PackageFinding>('GET', `/api/v1/code/orgs/${orgId}/findings/by-package?${qs}`)
}
