#!/usr/bin/env node
/**
 * Guard the frontend data-readiness boundary.
 *
 * Invariant: unresolved remote data must not be treated as business-empty
 * state. A fallback list is fine for display transforms, but empty/not-found/
 * locked/hidden decisions must wait for an explicit query boundary.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = process.argv.includes('--json')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function hasAll(text, patterns) {
  return patterns.every((pattern) => (
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
  ))
}

const QUERY_SIGNAL = /\b(useQuery|useQueries|use[A-Z][A-Za-z0-9_]*(Query|Queries)|\.data\?\.|\.isLoading|\.isFetching|\.isSuccess)\b/s
const FALLBACK_LIST = /(\?\.\w+\s*\?\?\s*\[\]|\b\w+\s*\?\?\s*\[\])/s
const EMPTY_DECISION = /(EmptyState|No [A-Z][^'"`<)]{2,80}|No data|not found|notFound|OnboardingView|locked|hidden|payment_required|length\s*===\s*0|!\w+\.length)/is
const HIGH_RISK_DECISION = /(not found|notFound|OnboardingView|locked|hidden|payment_required|No repositories found|No events match|No active approvals|No canonical|Unscanned)/is
const BOUNDARY_SIGNAL = /(DataBoundary|queryBoundaryState|queryResolved|queryUnresolved|querySucceeded|queryFailed|emptyStateReady|resolvedList|placeholderData|isSuccess|isError|isLoading|isFetching|ready|resolved|@data-boundary safe-derived)/s

const requiredChecks = [
  {
    id: 'dashboard-presence-ready',
    file: 'src-next/components/compounds/dashboard/DashboardView.tsx',
    reason: 'Dashboard empty/onboarding state must wait for repo, domain, cloud, runtime, and capability readiness.',
    patterns: [
      'const presenceReady =',
      /queryResolved\(reposQ,\s*!!org\?\.id\)/,
      /queryResolved\(domainQ,\s*!!org\?\.id\)/,
      /queryResolved\(cloudQ,\s*cloudEnabled\)/,
      /queryResolved\(runtimeQ,\s*runtimeEnabled\)/,
      /if \(!presenceReady \|\| loading\)/,
      /if \(!hasCode && !hasExternal && !hasCloud && !hasRuntime\)/,
    ],
  },
  {
    id: 'dashboard-page-no-repo-only-onboarding',
    file: 'src-next/app/(control-panel)/flyto/workspace/components/pages/DashboardPage.tsx',
    reason: 'DashboardPage must not route repo-empty orgs to onboarding before external/cloud presence is known.',
    forbidden: [
      /repos\?\.length === 0/,
      /<OnboardingView\b/,
    ],
  },
  {
    id: 'warroom-repo-readiness',
    file: 'src-next/components/compounds/warroom/WarRoomView.tsx',
    reason: 'WarRoom health sections must not show no-repos/no-data before connected repos and health summary resolve.',
    patterns: [
      /const reposQ = useConnectedRepos\(orgId\)/,
      /queryResolved\(reposQ,\s*!!orgId\)/,
      /enabled: !!orgId && needsHealth && reposQ\.isSuccess && repoList\.length > 0/,
      /if \(needsHealth && healthData && healthRepos\.length === 0\)/,
    ],
  },
  {
    id: 'repo-detail-resolved-before-not-found',
    file: 'src-next/app/(control-panel)/flyto/workspace/components/pages/RepoDetailPage.tsx',
    reason: 'Repo detail must only decide repository-not-found after connected repos have resolved.',
    patterns: [
      /const reposQ = useConnectedRepos\(org\?\.id\)/,
      /queryResolved\(reposQ,\s*!!org\?\.id\)/,
      /if \(!repo\) return <WorkspaceRouteFallback/,
    ],
  },
  {
    id: 'shared-query-state-helper',
    file: 'src-next/lib/queryState.ts',
    reason: 'Workspace readiness gates must share resolved/unresolved/success-empty semantics.',
    patterns: [
      /export function queryBoundaryState/,
      /export function queryResolved/,
      /export function querySucceeded/,
      /export function emptyStateReady/,
      /export function resolvedList/,
      /return querySucceeded\(query,\s*enabled\) \? \(items \?\? \[\]\) : \[\]/,
    ],
  },
  {
    id: 'repo-picker-connected-repos-ready',
    file: 'src-next/components/compounds/_shared/picker/RepoPickerModal.tsx',
    reason: 'Repo picker must not seed selected state from an unresolved connected-repos query.',
    patterns: [
      /const connectedReposReady = queryResolved\(connectedRepos,\s*!!org\?\.id\)/,
      /resolvedList\(connectedRepos\.data,\s*connectedRepos,\s*!!org\?\.id\)/,
      /if \(!connectedReposReady\) \{/,
    ],
  },
  {
    id: 'domain-detail-lazy-hydration-boundary',
    file: 'src-next/components/compounds/domains/DomainDetail.tsx',
    reason: 'Domain detail must not render lazy-hydrated domain signals as muted/no-data before attack-surface hydration resolves.',
    patterns: [
      /const surfaceReady = !needsHydration \|\| querySucceeded\(surfaceQ,\s*surfaceEnabled\)/,
      /if \(!surfaceReady\) return \[\]/,
      /<DataBoundary[\s\S]*queryUnresolved\(surfaceQ,\s*surfaceEnabled\)/,
      /<DataBoundary[\s\S]*queryUnresolved\(apiQ,\s*apiEnabled\)/,
    ],
  },
  {
    id: 'verify-dynamic-targets-fail-closed',
    file: 'src-next/components/compounds/security/VerifyFindingModal.tsx',
    reason: 'Dynamic verification must not fall back to free-text target entry while target allowlist is loading or failed.',
    patterns: [
      /const targetsLoading = queryUnresolved\(targetsQ,\s*targetsEnabled\)/,
      /const targetsUnavailable = queryFailed\(targetsQ,\s*targetsEnabled\)/,
      /!targetsLoading && !targetsUnavailable && !!targetUrl/,
      /t\('warroom\.verifyTargetsLoading'\)/,
      /t\('warroom\.verifyTargetsUnavailable'\)/,
    ],
  },
  {
    id: 'system-events-scope-before-empty',
    file: 'src-next/components/compounds/settings/SystemEventsTab.tsx',
    reason: 'System events must resolve admin/org scope and event query before showing zero totals or empty table rows.',
    patterns: [
      /const scopeReady = queryResolved\(scopeQ\)/,
      /const basePath = !scopeReady/,
      /const eventsReady = querySucceeded\(eventsQ,\s*!!basePath\)/,
      /const eventsFailed = queryFailed\(scopeQ\) \|\| queryFailed\(eventsQ,\s*!!basePath\)/,
      /eventsReady && events\.length === 0/,
    ],
  },
  {
    id: 'org-card-score-before-unscanned',
    file: 'src-next/app/(control-panel)/flyto/projects/components/OrgCard.tsx',
    reason: 'Org cards must not show Unscanned/No score before score and health queries resolve.',
    patterns: [
      /const healthReady = queryResolved\(healthQ,\s*repoCount > 0\)/,
      /const scoreReady = queryResolved\(scoreQ,\s*!!org\.id\)/,
      /querySucceeded\(scoreQ,\s*!!org\.id\) &&/,
      /t\('projects\.loadingScore'\)/,
    ],
  },
  {
    id: 'scan-approvals-safety-boundary',
    file: 'src-next/components/compounds/settings/ScanApprovalsTab.tsx',
    reason: 'Safety-critical scan approvals must not render empty approved/requested sections before approvals resolve.',
    patterns: [
      /const approvalsReady = querySucceeded\(q,\s*!!orgId\)/,
      /const approvalsLoading = queryUnresolved\(q,\s*!!orgId\)/,
      /t\('approval\.gateBody'\)/,
      /approvalsReady && requested\.length > 0/,
    ],
  },
  {
    id: 'org-chart-sync-connected-repos-ready',
    file: 'src-next/components/compounds/organization/useOrgChart.ts',
    reason: 'Org chart GitHub sync must not save a repo-less chart before connected repos resolve.',
    patterns: [
      /const connectedReposQ = useConnectedRepos\(org\?\.id\)/,
      /resolvedList\(connectedReposQ\.data,\s*connectedReposQ,\s*!!orgId\)/,
      /if \(!querySucceeded\(connectedReposQ,\s*!!orgId\)\) return/,
    ],
  },
]

const failures = []
for (const check of requiredChecks) {
  const text = read(check.file)
  if (check.patterns && !hasAll(text, check.patterns)) {
    failures.push({
      id: check.id,
      file: check.file,
      reason: check.reason,
      severity: 'P0',
      kind: 'missing-required-boundary',
    })
  }
  for (const forbidden of check.forbidden ?? []) {
    if (forbidden.test(text)) {
      failures.push({
        id: check.id,
        file: check.file,
        reason: check.reason,
        severity: 'P0',
        kind: 'forbidden-pattern',
        pattern: String(forbidden),
      })
    }
  }
}

const scanFindings = scanRepoWide()
for (const finding of scanFindings) {
  if (finding.fail) failures.push(finding)
}

const report = {
  schema: 'flyto-code.data-readiness-boundaries.v2',
  summary: {
    requiredChecks: requiredChecks.length,
    repoWideFindings: scanFindings.length,
    repoWideBlockingFindings: scanFindings.filter((f) => f.fail).length,
    fail: failures.length,
  },
  failures,
  repoWideFindings: scanFindings,
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`data readiness boundaries: ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
  console.log(`required checks: ${requiredChecks.length}`)
  console.log(`repo-wide findings: ${scanFindings.length} (${scanFindings.filter((f) => f.fail).length} blocking)`)
  for (const failure of failures) {
    console.log(`  ${failure.file} (${failure.id}, ${failure.severity}, ${failure.kind})`)
    console.log(`    ${failure.reason}`)
  }
  const warnings = scanFindings.filter((f) => !f.fail)
  if (warnings.length > 0) {
    console.log('repo-wide warnings:')
    for (const warning of warnings.slice(0, 20)) {
      console.log(`  ${warning.file} (${warning.severity}) ${warning.reason}`)
    }
    if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} more`)
  }
}

if (failures.length > 0) {
  process.exitCode = 1
}

function scanRepoWide() {
  const findings = []
  for (const file of sourceFiles(path.join(ROOT, 'src-next'))) {
    const rel = path.relative(ROOT, file).replaceAll(path.sep, '/')
    const text = fs.readFileSync(file, 'utf8')
    if (!QUERY_SIGNAL.test(text) || !FALLBACK_LIST.test(text) || !EMPTY_DECISION.test(text)) continue
    if (BOUNDARY_SIGNAL.test(text)) continue
    const severity = HIGH_RISK_DECISION.test(text) ? 'P1' : 'P2'
    findings.push({
      id: `repo-wide-${slug(rel)}`,
      file: rel,
      reason: severity === 'P1'
        ? 'Fallback list appears to drive an empty/not-found/locked/hidden user-visible decision without a query boundary.'
        : 'Fallback list is near an empty-state pattern; review and mark with query helpers if it drives product state.',
      severity,
      kind: 'repo-wide-unresolved-as-empty',
      fail: severity === 'P1',
    })
  }
  return findings
}

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
    if (entry.name === '__tests__' || entry.name === 'test' || entry.name === '@mock-utils') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue
    if (/\.test\.(tsx?|jsx?)$/.test(entry.name)) continue
    if (/\.gen\.(tsx?|jsx?)$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function slug(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}
