import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const outDir = path.join(root, 'out', 'release')
const evidencePath = path.join(outDir, 'release-evidence.json')

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const evidence = {
  project: 'flyto-code',
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  git: {
    head: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(['status', '--short']).length > 0,
  },
  gates: {
    branchGuard: 'npm run guard:branch',
    unit: 'npx vitest run',
    build: 'npm run build',
    security: 'npm run security:audit',
    bundleBudget: 'npm run release:bundle-budget',
    staticSmoke: 'npm run release:static-smoke',
    deployPolicy: 'npm run release:deploy-policy',
    githubActionsStartup: 'npm run audit:github-actions-startup',
  },
  artifacts: {
    bundleBudget: readJsonIfExists(path.join(outDir, 'bundle-budget.json')),
    staticSmoke: readJsonIfExists(path.join(outDir, 'static-smoke.json')),
    deployPolicy: readJsonIfExists(path.join(outDir, 'deploy-policy.json')),
    githubActionsStartup: readJsonIfExists(path.join(outDir, 'github-actions-startup.json')),
  },
  acceptedWarnings: [
    {
      id: 'medium-dependencies',
      policy: 'Critical/High block release; Moderate/Medium tracked outside release blocker.',
    },
  ],
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`Release evidence written: ${evidencePath}`)
