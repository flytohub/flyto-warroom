#!/usr/bin/env node
/**
 * Guard the Flyto2 Code moat: a decision-grade evidence chain, not a pile of
 * disconnected security pages.
 *
 * This is intentionally static. It catches regressions where a future change
 * deletes the enriched Risk Decision data path, BYO source routing, Agent
 * Firewall evidence report, AutoFix/Pentest hooks, or the UI surfaces that
 * consume those signals.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const engineRoot = path.resolve(repoRoot, '..', 'flyto-engine')

const failures = []
let checked = 0
let skippedBackend = false

function read(root, rel) {
  const abs = path.resolve(root, rel)
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch (err) {
    failures.push(`${rel}: cannot read (${err.message})`)
    return ''
  }
}

function readMany(root, rels) {
  return rels.map((rel) => read(root, rel)).join('\n')
}

function hasEngine() {
  return fs.existsSync(path.resolve(engineRoot, 'api/router.go'))
}

function requireTokens(label, root, rel, tokens) {
  const text = read(root, rel)
  if (!text) return
  checked += 1
  const missing = tokens.filter((token) => !text.includes(token))
  if (missing.length > 0) {
    failures.push(`${label} (${rel}) missing: ${missing.join(', ')}`)
  }
}

function requireTokensAcross(label, root, rels, tokens) {
  const text = readMany(root, rels)
  if (!text) return
  checked += 1
  const missing = tokens.filter((token) => !text.includes(token))
  if (missing.length > 0) {
    failures.push(`${label} (${rels.join(', ')}) missing: ${missing.join(', ')}`)
  }
}

function engineRouteContractFiles() {
  const apiDir = path.resolve(engineRoot, 'api')
  return [
    'api/authz_routes_registry.go',
    ...fs.readdirSync(apiDir)
      .filter((name) => name.startsWith('routes_') && name.endsWith('.go'))
      .sort()
      .map((name) => `api/${name}`),
  ]
}

function requireRoute(method, route) {
  requireTokensAcross(
    `${method} ${route}`,
    engineRoot,
    engineRouteContractFiles(),
    [`${method} ${route}`],
  )
}

if (hasEngine()) {
  requireTokens('backend decision correlation model', engineRoot, 'internal/correlate/correlate.go', [
    'open_prs_touching',
    'taint_adjacency',
    'autofix_eligible',
    'pentest_verdict',
    'blast_radius',
    'CrossSurfaceEdges',
    'computeBlastRadius',
  ])

  requireTokens('backend enriched issues handler', engineRoot, 'api/handlers_issues.go', [
    'r.URL.Query().Get("enrich") == "true"',
    'correlate.LocationContext',
    'EnrichByLocation',
  ])

  requireTokens('BYO immediate materialization', engineRoot, 'internal/importmap/ingest_integration.go', [
    'byo.Materialize',
    'bridged BYO claims to findings post-ingest',
  ])

  requireTokensAcross(
    'BYO worker fallback loop',
    engineRoot,
    [
      'cmd/worker/worker_bootstrap_config.go',
      'cmd/worker/worker_scoring.go',
      'internal/byo/materialize.go',
    ],
    [
      'FLYTO_BYO_MATERIALIZE_INTERVAL',
      'runByoMaterializeLoop',
      'byo.MaterializeAll',
    ],
  )

  requireTokens('BYO source gate', engineRoot, 'api/code_module_gate.go', [
    'IsModuleSourceActiveForOrg',
    'allowed_sources',
    'sourceKind',
  ])

  requireTokens('pentest to evidence handoff', engineRoot, 'api/pentest_helpers.go', [
    'ingestPentestFindingsAsEvidence',
    'CreatePipelineEvidence',
    'EventPipelineEvidence',
  ])

  for (const [method, route] of [
    ['GET', '/api/v1/code/orgs/{id}/issues'],
    ['GET', '/api/v1/code/orgs/{id}/pulse'],
    ['GET', '/api/v1/code/orgs/{id}/findings/{fingerprint}'],
    ['GET', '/api/v1/code/alerts/{id}/blast-graph'],
    ['GET', '/api/v1/code/orgs/{id}/taint-flows'],
    ['GET', '/api/v1/code/orgs/{id}/autofix/findings'],
    ['GET', '/api/v1/code/orgs/{id}/mcp/reports/evidence'],
    ['GET', '/api/v1/code/orgs/{id}/fusion/modules'],
    ['PUT', '/api/v1/code/orgs/{id}/fusion/modules'],
    ['POST', '/api/v1/code/pipeline/runs/{id}/evidence'],
    ['POST', '/api/v1/code/pentests/{id}/run'],
    ['GET', '/api/v1/code/pentests/{id}/scans/{scanId}/findings'],
  ]) {
    requireRoute(method, route)
  }
} else {
  skippedBackend = true
}

requireTokens('frontend enriched issue client', repoRoot, 'src-next/lib/engine/code/issues.ts', [
  'getEnrichedOrgIssues',
  'getOrgPulse',
  'getUnifiedFinding',
  'blast_radius',
  'open_prs_touching',
  'taint_adjacency',
  'autofix_eligible',
  'pentest_verdict',
])

requireTokens('frontend decision context strip', repoRoot, 'src-next/components/atoms/ContextStrip.tsx', [
  'open_prs_touching',
  'taint_adjacency',
  'autofix_eligible',
  'pentest_verdict',
  'blast_radius',
])

requireTokens('frontend fix queue action priority', repoRoot, 'src-next/components/compounds/fix-queue/FixQueueDrawer.tsx', [
  'Recommended-action priority',
  'autofix_eligible',
  'open_prs_touching',
  'taint_adjacency',
  'pentest_verdict',
  'recommendAction',
])

requireTokens('frontend BYO source routing control plane', repoRoot, 'src-next/components/compounds/settings/ModuleRoutingSection.tsx', [
  'GATED_MODULES',
  "module: 'external'",
  "module: 'code'",
  'allowedSources',
  'integrations.routing.flytoSuppressed',
])

requireTokens('frontend Agent Firewall evidence report view', repoRoot, 'src-next/components/compounds/surface/mcp/AISecurityGovernanceViews.tsx', [
  'EvidenceReportsView',
  'getMcpEvidenceReport',
  'mcpEvidenceReportUrl',
  'qk.mcp.evidence',
])

requireTokens('frontend canonical decision query keys', repoRoot, 'src-next/lib/queryKeys.ts', [
  'issuesEnriched',
  'unifiedFinding',
  'alertBlastGraph',
  'taintFlows',
  'autofix-findings',
  'pentest-scan-findings',
  'mcp-evidence',
  'org-modules',
])

requireTokens('frontend platform loop registry keeps runtime/cloud/identity together', repoRoot, 'docs/platform-loops/platform-loop-registry.json', [
  'runtime_cloud_identity',
  'agent_firewall_attack_lab',
  'ai_security_center',
  'ai_evidence_reports',
])

requireTokens('durable moat contract doc', repoRoot, 'docs/DECISION_CHAIN_MOAT.md', [
  'Risk Decision evidence chain',
  'BYO evidence',
  'Agent Firewall outputs',
  'audit:decision-chain',
  'guard:branch',
])

if (failures.length > 0) {
  console.error('decision chain audit: FAIL')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

const suffix = skippedBackend ? ' (backend checks skipped: ../flyto-engine not found)' : ''
console.log(`decision chain audit: PASS (${checked} checkpoints)${suffix}`)
