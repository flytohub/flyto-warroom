#!/usr/bin/env node
/**
 * Guard Flyto2 split/merge product closure.
 *
 * Every enterprise domain must be independently enabled, disabled, tested,
 * deployed, sold, and evidenced while still merging into the unified cockpit.
 * Cross-domain coupling is only allowed through the six platform contracts.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MATRIX_FILE = path.join(ROOT, 'docs', 'platform-loops', 'flyto2-module-matrix.json')
const MODULES_FILE = path.join(ROOT, 'src-next', 'types', 'modules.ts')
const MODULE_MANIFEST_DIR = path.join(ROOT, 'src-next', 'types', 'module-manifests')
const PACKAGE_FILE = path.join(ROOT, 'package.json')
const BRANCH_GUARD_FILE = path.join(ROOT, 'scripts', 'ai-branch-guard.mjs')
const CI_FILE = path.join(ROOT, '.github', 'workflows', 'ci.yml')

const REQUIRED_DOMAIN_IDS = [
  'ctem_external_attack_surface',
  'darkweb_threat_intel',
  'pentest_dast_redteam',
  'ai_governance',
  'code_security',
  'cloud_container_identity',
  'rbac_entitlement_billing',
  'scheduler_runner_evidence_sse',
  'compliance_audit_enterprise',
]

const REQUIRED_MERGE_SIGNALS = [
  'unifiedCockpit',
  'pulse',
  'score',
  'timeline',
  'evidenceGraph',
  'crossSurfaceCorrelation',
]

const REQUIRED_CONTRACTS = [
  'capability',
  'surfaceRegistry',
  'resourceKernel',
  'eventEvidence',
  'api',
  'fusion',
]

const REQUIRED_FEATURES = {
  ctem_external_attack_surface: [
    'footprint discovery',
    'attack surface inventory',
    'asset map',
    'external posture',
    'CTEM issue lifecycle',
    'verify fixed',
    'reopen',
    'false positive',
    'SLA',
    'MTTR',
    'mitigations',
    'attack paths',
    'pulse',
    'scoring',
  ],
  darkweb_threat_intel: [
    'darkweb intel',
    'stealer logs',
    'credential exposure',
    'leak exposure',
    'phishing feeds',
    'certphish',
    'threat feed refresh',
    'correlation',
    'threat actors',
    'malware families',
    'ransomware incidents',
    'IOC lookup',
    'sensor map',
    'brand protection',
    'impersonation',
    'typosquat',
    'GitHub brand impersonation',
  ],
  pentest_dast_redteam: [
    'pentest projects',
    'active DAST',
    'scan approvals',
    'attack-surface scan',
    'red team workflows',
    'safe authorization gate',
    'evidence bundle',
    'report output',
    'replay timeline',
  ],
  ai_governance: [
    'AI quota',
    'provider gate',
    'no fake provider success',
    'AI chat usage',
    'AI report usage',
    'AI pipeline usage',
    'AI governance events',
    'MCP guardian',
    'MCP events',
    'MCP policy',
    'MCP simulation',
    'MCP egress risk',
    'deterministic fallback',
  ],
  code_security: [
    'SAST',
    'SCA',
    'secrets',
    'IaC',
    'reachability',
    'package extraction',
    'repo scan lifecycle',
    'scan upload',
    'code findings',
    'code score',
    'AutoFix deterministic rules',
    'AutoFix AI proposal gate',
    'PR evidence',
    'promotion evidence',
    'approval evidence',
    'rollback evidence',
  ],
  cloud_container_identity: [
    'CSPM',
    'AWS connector',
    'GCP connector',
    'Azure connector',
    'Cloudflare connector',
    'Kubernetes connector',
    'Okta connector',
    'cloud posture',
    'cloud IAM analyzer',
    'cloud IAM evaluator',
    'container image',
    'container workload',
    'container posture',
    'container findings',
    'VM inventory',
    'VM posture',
    'live connector scan',
    'project-scoped source separation',
    'identity posture',
    'identity access graph',
    'OAuth apps',
    'SSO',
    'SAML',
    'SCIM',
    'RBAC',
    'cross-org isolation',
  ],
  rbac_entitlement_billing: [
    'capability snapshot',
    'commercial gates',
    'RBAC additive permissions',
    'action permissions',
    'feature visibility',
    'page visibility',
    'billing webhooks',
    'billing events',
    'entitlement changes',
    'fail-closed behavior',
    'no hidden fail-open',
  ],
  scheduler_runner_evidence_sse: [
    'scanregistry',
    'scanners.yaml',
    'scheduler control plane',
    'scheduler run ledger',
    'runner execution',
    'runner callback',
    'campaign executions',
    'evidence signature',
    'screenshot',
    'DOM snapshot',
    'network log',
    'replay result',
    'evidence pack',
    'SSE status',
    'SSE artifacts',
    'SSE signature',
    'Product Verification',
  ],
  compliance_audit_enterprise: [
    'audit timeline',
    'audit export',
    'compliance evidence',
    'report export',
    'legal hold',
    'data residency',
    'data retention',
    'offline license',
    'enterprise airgap',
    'deployment edition boundaries',
    'notification channels',
    'notification rules',
    'notification deliveries',
    'runtime API key ingestion',
    'fusion',
    'BYO integrations',
  ],
}

const violations = []

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    violations.push({ file: rel(file), reason: `missing or unreadable: ${error.message}` })
    return ''
  }
}

function readJson(file) {
  const text = read(file)
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    violations.push({ file: rel(file), reason: `invalid JSON: ${error.message}` })
    return {}
  }
}

function asSet(values) {
  return new Set(Array.isArray(values) ? values : [])
}

function sorted(values) {
  return [...new Set(values)].sort()
}

function collectKnownModuleIds() {
  const ignoredManifestFiles = new Set(['boundary.ts', 'index.ts', 'packageManifest.ts'])
  const ids = new Set()
  let entries = []
  try {
    entries = fs.readdirSync(MODULE_MANIFEST_DIR, { withFileTypes: true })
  } catch (error) {
    violations.push({ file: rel(MODULE_MANIFEST_DIR), reason: `missing module manifest directory: ${error.message}` })
    return ids
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || ignoredManifestFiles.has(entry.name)) continue
    const text = read(path.join(MODULE_MANIFEST_DIR, entry.name))
    for (const match of text.matchAll(/id:\s*['"]([^'"]+)['"]/g)) {
      ids.add(match[1])
    }
  }

  if (ids.size === 0) {
    violations.push({ file: rel(MODULE_MANIFEST_DIR), reason: 'module manifests must expose at least one module id' })
  }
  return ids
}

function sameSet(left, right) {
  const a = sorted(left)
  const b = sorted(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function expectArray(domain, field, min = 1) {
  const value = domain[field]
  if (!Array.isArray(value) || value.length < min || value.some((item) => String(item || '').trim() === '')) {
    violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `${field} must contain at least ${min} non-empty item(s)` })
    return []
  }
  return value
}

function expectPackageScript(name, command) {
  const pkg = readJson(PACKAGE_FILE)
  if (pkg.scripts?.[name] !== command) {
    violations.push({
      file: rel(PACKAGE_FILE),
      reason: `package script ${name} must be ${JSON.stringify(command)}`,
    })
  }
}

function expectIncludes(file, marker, reason) {
  const text = read(file)
  if (!text.includes(marker)) {
    violations.push({ file: rel(file), reason: `${reason}: missing ${JSON.stringify(marker)}` })
  }
}

const matrix = readJson(MATRIX_FILE)
expectIncludes(MODULES_FILE, "export * from './module-manifests'", 'module registry facade must re-export module manifests')
const knownModules = collectKnownModuleIds()

if (matrix.schema !== 'flyto-code.flyto2-module-matrix.v1') {
  violations.push({ file: rel(MATRIX_FILE), reason: 'unexpected module matrix schema' })
}

if (!sameSet(matrix.requiredMergeSignals, REQUIRED_MERGE_SIGNALS)) {
  violations.push({
    file: rel(MATRIX_FILE),
    reason: `requiredMergeSignals must be ${REQUIRED_MERGE_SIGNALS.join(', ')}`,
  })
}

if (!sameSet(matrix.allowedContracts, REQUIRED_CONTRACTS)) {
  violations.push({
    file: rel(MATRIX_FILE),
    reason: `allowedContracts must be ${REQUIRED_CONTRACTS.join(', ')}`,
  })
}

const domains = Array.isArray(matrix.domains) ? matrix.domains : []
if (!sameSet(domains.map((domain) => domain.id), REQUIRED_DOMAIN_IDS)) {
  violations.push({
    file: rel(MATRIX_FILE),
    reason: `domains must exactly cover ${REQUIRED_DOMAIN_IDS.join(', ')}`,
  })
}

for (const domain of domains) {
  if (!domain || typeof domain !== 'object') {
    violations.push({ file: rel(MATRIX_FILE), reason: 'domain entries must be objects' })
    continue
  }
  for (const field of ['id', 'label', 'surface', 'commercialSku']) {
    if (typeof domain[field] !== 'string' || !domain[field].trim()) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `${field} must be a non-empty string` })
    }
  }

  for (const moduleId of expectArray(domain, 'modules')) {
    if (!knownModules.has(moduleId)) {
      violations.push({ file: rel(MODULE_MANIFEST_DIR), domain: domain.id, reason: `unknown module id ${moduleId}` })
    }
  }

  expectArray(domain, 'capabilityRoots')
  expectArray(domain, 'userVisibleFeatures')
  expectArray(domain, 'independentTests')
  expectArray(domain, 'evidenceOutputs')
  expectArray(domain, 'apiContracts')
  expectArray(domain, 'eventContracts')
  expectArray(domain, 'fusionInputs')

  for (const feature of REQUIRED_FEATURES[domain.id] ?? []) {
    if (!domain.userVisibleFeatures?.includes(feature)) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `missing user-visible feature ${JSON.stringify(feature)}` })
    }
  }

  const standalone = domain.standalone || {}
  for (const flag of ['canEnable', 'canDisable', 'canTest', 'canDeploy', 'canSell', 'canEmitEvidence']) {
    if (standalone[flag] !== true) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `standalone.${flag} must be true` })
    }
  }
  for (const field of ['enableControl', 'disableControl', 'deployBoundary', 'sellBoundary', 'evidenceBoundary']) {
    if (typeof standalone[field] !== 'string' || !standalone[field].trim()) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `standalone.${field} must be a non-empty string` })
    }
  }

  const merge = domain.merge || {}
  for (const signal of REQUIRED_MERGE_SIGNALS) {
    if (merge[signal] !== true) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `merge.${signal} must be true` })
    }
  }
  if (!sameSet(merge.contracts, REQUIRED_CONTRACTS)) {
    violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `merge.contracts must exactly be ${REQUIRED_CONTRACTS.join(', ')}` })
  }

  const coupling = domain.coupling || {}
  if (coupling.hardCouplingAllowed !== false) {
    violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: 'coupling.hardCouplingAllowed must be false' })
  }
  if (!sameSet(coupling.allowedContracts, REQUIRED_CONTRACTS)) {
    violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `coupling.allowedContracts must exactly be ${REQUIRED_CONTRACTS.join(', ')}` })
  }

  const contracts = domain.contracts || {}
  for (const contract of REQUIRED_CONTRACTS) {
    const values = contracts[contract]
    if (!Array.isArray(values) || values.length === 0 || values.some((item) => String(item || '').trim() === '')) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `contracts.${contract} must be non-empty` })
    }
  }

  const declaredCapabilities = asSet(domain.capabilityRoots)
  const contractCapabilities = asSet(contracts.capability)
  for (const cap of declaredCapabilities) {
    if (!contractCapabilities.has(cap)) {
      violations.push({ file: rel(MATRIX_FILE), domain: domain.id, reason: `contracts.capability must include capabilityRoots item ${cap}` })
    }
  }
}

expectPackageScript('audit:module-matrix', 'node scripts/audit-flyto2-module-matrix.mjs')
expectIncludes(BRANCH_GUARD_FILE, 'audit:module-matrix', 'branch guard must include module matrix audit')
expectIncludes(CI_FILE, 'audit:module-matrix', 'CI must include module matrix audit')

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.flyto2-module-matrix-audit.v1', ok: false, violations }, null, 2))
  process.exit(1)
}

const moduleCount = domains.reduce((sum, domain) => sum + (domain.modules?.length || 0), 0)
const featureCount = domains.reduce((sum, domain) => sum + (domain.userVisibleFeatures?.length || 0), 0)
console.log(`flyto2 module matrix audit: PASS (${domains.length} domains, ${moduleCount} module bindings, ${featureCount} visible features)`)
