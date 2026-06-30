#!/usr/bin/env node
/**
 * Guard the Product Verification cockpit from regressing into a contract-only
 * page or a polling-driven dashboard. The runtime loop is SSE + evidence pack:
 * Discovery -> Intent Graph -> YAML Scenario -> Replay Timeline -> artifacts.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viewPath = path.join(ROOT, 'src-next/components/compounds/product-verification/ProductVerificationView.tsx')
const e2ePath = path.join(ROOT, 'e2e/product_verification_evidence.spec.ts')
const enBundlePath = path.join(ROOT, 'public/i18n/code/en.json')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

const view = read(viewPath)
const e2e = read(e2ePath)
const enTranslations = flattenCodeTranslations(JSON.parse(read(enBundlePath)))

const requiredViewTokens = [
  'Overview',
  'Discovery',
  'Intent Graph',
  'YAML Scenarios',
  'Replay Timeline',
  'Screenshots',
  'Network / API',
  'Network/API',
  'State Contradictions',
  'Ghost APIs',
  'RBAC / Entitlement',
  'Scheduler Runs',
  'Evidence Pack',
  'Target under verification',
  'Customer target URL',
  'Target owner',
  'customer-owned URL/domain/repo',
  'Verifier provenance',
  'Control plane',
  'Verifier authorization evidence',
  'Verifier authority',
  "value: 'overview'",
  "value: 'discovery'",
  "value: 'intent'",
  "value: 'yaml'",
  "value: 'replay'",
  "value: 'screenshots'",
  "value: 'network'",
  "value: 'contradictions'",
  "value: 'ghost'",
  "value: 'rbac'",
  "value: 'scheduler'",
  "value: 'evidence'",
  'false_empty',
  'false_locked',
  'hidden_error',
  'ghost_api_type_a',
  'ghost_api_type_b',
  'ghost_api_type_c',
  'state_contradiction',
  'rbac_fail_open',
  'roles_required',
  'role_expectations',
  'tenant_isolation',
  'fail_open_disallowed',
  'frontend_authority',
  'authorization_gate',
  'expected_payload_fields',
  'Evidence signature',
  'Artifact completeness',
  'Roles required',
  'Tenant isolation',
  'Open gate disallowed',
  'qk.warroomVerification.runs',
  'qk.warroomVerification.evidence',
]

const requiredE2ETokens = [
  'campaign_execution.updated',
  'runnerExecutionId',
  'evidenceSig',
  'gate_verdict',
  'gate_score',
  'artifacts',
  'artifactCompleteness',
  'scoreBreakdown',
  'evidencePackHasReplayModel',
  'dom_snapshot',
  'network_log',
  'backend fail-closed scope gates do not create hidden product verification runs',
  'scope is empty',
  'target_url is outside the engine-computed verification scope',
  'scheduler control plane is explicit and never reports fake run-now success',
  'FLYTO_PRODUCT_VERIFY_SCHEDULER_SMOKE',
  'cleanupVerifiedRepoScopes',
  'YAML Scenarios',
  'Replay Timeline',
  'Network / API',
  'RBAC \\/ Entitlement',
  'product-verification-mobile.png',
  'product-verification-rbac-entitlement.png',
  'product-verification-scheduler-runs.png',
  'product-verification-evidence.png',
  'product-verification-yaml-scenarios.png',
  'product-verification-replay-timeline.png',
  'product-verification-network-api.png',
]

const failures = []
if (view.includes('refetchInterval')) {
  failures.push({
    file: path.relative(ROOT, viewPath),
    reason: 'ProductVerificationView must rely on SSE invalidation, mutation invalidation, and manual refresh, not component polling.',
    token: 'refetchInterval',
  })
}

for (const token of requiredViewTokens) {
  if (!viewHasToken(token)) {
    failures.push({ file: path.relative(ROOT, viewPath), reason: 'missing cockpit surface token', token })
  }
}

for (const token of requiredE2ETokens) {
  if (!e2e.includes(token)) {
    failures.push({ file: path.relative(ROOT, e2ePath), reason: 'missing full-stack smoke assertion token', token })
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    schema: 'flyto-code.product-verification-cockpit-audit.v1',
    ok: false,
    failures,
  }, null, 2))
  process.exit(1)
}

console.log('product verification cockpit audit: PASS')

function viewHasToken(token) {
  if (view.includes(token)) return true
  const matchingKeys = Object.entries(enTranslations)
    .filter(([, value]) => value === token)
    .map(([key]) => key)
  return matchingKeys.some((key) => (
    view.includes(`t('${key}'`) ||
    view.includes(`t("${key}"`) ||
    view.includes(`tOr('${key}'`) ||
    view.includes(`tOr("${key}"`)
  ))
}

function flattenCodeTranslations(bundle) {
  const out = {}
  const root = bundle?.translations?.code ?? bundle?.translations ?? {}
  flatten(root, '', out)
  return out
}

function flatten(node, prefix, out) {
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[fullKey] = value
    } else {
      flatten(value, fullKey, out)
    }
  }
}
