import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'out', 'release')
const reportPath = path.join(outDir, 'deploy-policy.json')

const checks = [
  {
    id: 'prod-manual-promotion',
    file: '.github/workflows/deploy-warroom.yml',
    required: ['workflow_dispatch:', 'staging_run_id', 'environment:', 'production', 'Verify staging run id matches target SHA'],
    forbidden: ['branches:'],
  },
  {
    id: 'prod-staging-run-sha-match',
    file: '.github/workflows/deploy-warroom.yml',
    required: ['actions/runs', 'head_sha', 'TARGET_SHA', 'Deploy Warroom (staging)'],
    forbidden: [],
  },
  {
    id: 'deploy-ref-sha-tags',
    file: '.github/workflows/deploy-warroom.yml',
    required: ['Resolve target SHA', 'steps.rev.outputs.sha'],
    forbidden: [],
  },
  {
    id: 'prod-core-min-instance',
    file: '.github/workflows/deploy-warroom.yml',
    required: ['--min-instances=1'],
    forbidden: [],
  },
  {
    id: 'prod-smoke-rollback',
    file: '.github/workflows/deploy-warroom.yml',
    required: ['Smoke test + auto-rollback', '--to-revisions=$PREV=100'],
    forbidden: [],
  },
  {
    id: 'staging-smoke',
    file: '.github/workflows/deploy-warroom-staging.yml',
    required: ['workflow_dispatch:', 'flyto-warroom-staging', 'Smoke test', 'steps.rev.outputs.sha'],
    forbidden: [],
  },
]

const results = checks.map((check) => {
  const filePath = path.join(root, check.file)
  const text = fs.readFileSync(filePath, 'utf8')
  const missing = check.required.filter((token) => !text.includes(token))
  const forbiddenPresent = check.forbidden.filter((token) => text.includes(token))
  return {
    id: check.id,
    file: check.file,
    ok: missing.length === 0 && forbiddenPresent.length === 0,
    missing,
    forbiddenPresent,
  }
})

const failures = results.filter((result) => !result.ok)
const report = {
  project: 'flyto-code',
  generatedAt: new Date().toISOString(),
  checks: results,
  failureCount: failures.length,
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (failures.length > 0) {
  console.error(`Release deploy policy failed. Report: ${reportPath}`)
  for (const failure of failures) {
    console.error(`- ${failure.id}: missing=${failure.missing.join(',')} forbidden=${failure.forbiddenPresent.join(',')}`)
  }
  process.exit(1)
}

console.log(`Release deploy policy passed. Report: ${reportPath}`)
