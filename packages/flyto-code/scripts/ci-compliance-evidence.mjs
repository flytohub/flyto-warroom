#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.resolve(
  ROOT,
  process.env.COMPLIANCE_EVIDENCE_OUT || 'out/compliance/ci-evidence.json',
)

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function readFirstExisting(rels) {
  for (const rel of rels) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) {
      return { rel, text: fs.readFileSync(abs, 'utf8') }
    }
  }
  throw new Error(`missing required compliance evidence file; looked for: ${rels.join(', ')}`)
}

function has(text, pattern) {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
}

function control(id, title, evidence, ok) {
  return {
    id,
    title,
    status: ok ? 'pass' : 'fail',
    evidence,
  }
}

const ci = read('.github/workflows/ci.yml')
const securityWorkflow = readFirstExisting(['.github/workflows/security-scan.yml', '.github/workflows/security.yml'])
const security = securityWorkflow.text
const commandRisk = read('.github/workflows/command-risk.yml')
const dependabot = read('.github/dependabot.yml')
const platformLoopRegistry = read('docs/platform-loops/platform-loop-registry.json')
const navbarSmokeRegistry = read('docs/platform-loops/navbar-smoke-registry.json')
const pkg = JSON.parse(read('package.json'))

const controls = [
  control('CI-001', 'Dependencies install from package-lock with npm ci', ['.github/workflows/ci.yml: npm ci'], has(ci, 'npm ci')),
  control('CI-002', 'Lint gate runs on pull requests and main pushes', ['.github/workflows/ci.yml: npm run lint'], has(ci, 'npm run lint')),
  control('CI-003', 'TypeScript compile gate runs before build', ['.github/workflows/ci.yml: tsc -b'], has(ci, /tsc\s+-b/)),
  control('CI-004', 'Unit tests run in CI', ['.github/workflows/ci.yml: vitest run'], has(ci, 'vitest run')),
  control('CI-005', 'Frontend/backend route drift is checked in CI', ['.github/workflows/ci.yml: npm run check:routes'], has(ci, 'npm run check:routes')),
  control('CI-006', 'Frontend data mutations must close their query loop', ['.github/workflows/ci.yml: npm run audit:closure'], has(ci, 'npm run audit:closure')),
  control('CI-007', 'Platform surfaces must keep module/API/query/event/recipe loops closed', ['.github/workflows/ci.yml: npm run audit:loops'], has(ci, 'npm run audit:loops')),
  control('CI-008', 'Production build runs with explicit placeholder env', ['.github/workflows/ci.yml: npm run build + VITE_* env'], has(ci, 'npm run build') && has(ci, 'VITE_ENGINE_URL')),
  control('CI-009', 'Navbar browser-smoke registry is checked in CI', ['.github/workflows/ci.yml: npm run audit:navbar-smoke'], has(ci, 'npm run audit:navbar-smoke')),
  control('CI-010', 'AI code quality guard runs in CI', ['.github/workflows/ci.yml: npm run guard:ai-code'], has(ci, 'npm run guard:ai-code')),
  control('CI-011', 'Data readiness boundaries are checked in CI', ['.github/workflows/ci.yml: npm run audit:data-readiness'], has(ci, 'npm run audit:data-readiness')),
  control(
    'SEC-001',
    'Changed commits, the current tree, and npm dependencies are scanned fail-closed',
    [`${securityWorkflow.rel}: checksum-pinned gitleaks git + dir scans and npm audit`],
    has(security, 'GITLEAKS_SHA256')
      && has(security, 'gitleaks git .')
      && has(security, 'gitleaks dir .')
      && has(security, 'npm ci --legacy-peer-deps')
      && has(security, 'npm audit --audit-level=low'),
  ),
  control('SEC-002', 'SBOM and CodeQL security jobs are present', [`${securityWorkflow.rel}: reusable-sbom.yml + reusable-codeql.yml`], has(security, 'reusable-sbom.yml@main') && has(security, 'reusable-codeql.yml@main')),
  control('SEC-003', 'Command-injection SAST rules have a blocking self-test', ['.github/workflows/command-risk.yml: rules-selftest'], has(commandRisk, 'rules-selftest') && has(commandRisk, '.semgrep/selftest.py')),
  control('SEC-004', 'Command-risk SARIF is uploaded as an artifact', ['.github/workflows/command-risk.yml: upload-artifact'], has(commandRisk, 'upload-artifact') && has(commandRisk, 'semgrep.sarif')),
  control('SCA-001', 'Dependabot tracks npm and GitHub Actions supply-chain drift', ['.github/dependabot.yml: npm + github-actions'], has(dependabot, 'package-ecosystem: npm') && has(dependabot, 'package-ecosystem: github-actions')),
  control('GOV-001', 'Compliance evidence contract is available as an npm script', ['package.json: scripts.compliance:ci'], pkg.scripts?.['compliance:ci'] === 'node scripts/ci-compliance-evidence.mjs'),
  control('GOV-002', 'Production dependency audit can be run locally by policy', ['package.json: scripts.security:audit'], pkg.scripts?.['security:audit'] === 'npm audit --omit=dev --audit-level=high'),
  control('GOV-003', 'Frontend closure audit can be run locally by policy', ['package.json: scripts.audit:closure'], pkg.scripts?.['audit:closure'] === 'node scripts/audit-frontend-closure.mjs --fail-on-mutation-gaps --fail-on-inline-query-keys'),
  control('GOV-004', 'Platform loop audit can be run locally by policy', ['package.json: scripts.audit:loops'], pkg.scripts?.['audit:loops'] === 'node scripts/audit-platform-loops.mjs'),
  control('GOV-005', 'AI branch guard aggregates route, closure, loop, navbar, AI-code, and compliance checks', ['package.json: scripts.guard:branch'], pkg.scripts?.['guard:branch'] === 'node scripts/ai-branch-guard.mjs'),
  control('GOV-006', 'AI code quality guard can be run locally by policy', ['package.json: scripts.guard:ai-code'], pkg.scripts?.['guard:ai-code'] === 'node scripts/audit-ai-code-quality.mjs'),
  control('GOV-007', 'Navbar smoke registry audit can be run locally by policy', ['package.json: scripts.audit:navbar-smoke'], pkg.scripts?.['audit:navbar-smoke'] === 'node scripts/audit-navbar-smoke-registry.mjs'),
  control('GOV-008', 'Platform loop ownership is schema-versioned data, not a script-only constant', ['docs/platform-loops/platform-loop-registry.json'], has(platformLoopRegistry, '"schema": "flyto-code.platform-loop-registry.v1"')),
  control('GOV-009', 'Navbar smoke ownership is schema-versioned data', ['docs/platform-loops/navbar-smoke-registry.json'], has(navbarSmokeRegistry, '"schema": "flyto-code.navbar-smoke-registry.v1"')),
  control('GOV-010', 'Data readiness boundary audit can be run locally by policy', ['package.json: scripts.audit:data-readiness'], pkg.scripts?.['audit:data-readiness'] === 'node scripts/audit-data-readiness-boundaries.mjs'),
]

const failed = controls.filter((c) => c.status !== 'pass')
const evidence = {
  schema: 'flyto-code.ci-compliance-evidence.v1',
  generated_at: new Date().toISOString(),
  repository: 'flyto-code',
  summary: {
    total: controls.length,
    pass: controls.length - failed.length,
    fail: failed.length,
  },
  controls,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`)

if (failed.length > 0) {
  for (const c of failed) {
    console.error(`${c.id} FAIL: ${c.title}`)
  }
  console.error(`Compliance evidence written to ${path.relative(ROOT, outPath)}`)
  process.exit(1)
}

console.log(`Compliance evidence OK: ${controls.length} controls passing`)
console.log(`Compliance evidence written to ${path.relative(ROOT, outPath)}`)
