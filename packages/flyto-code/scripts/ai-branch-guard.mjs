#!/usr/bin/env node
/**
 * Local aggregate guard for AI-generated or fast-moving branches.
 *
 * CI keeps these checks as separate steps for readable failure tabs. This
 * script gives maintainers one command before pushing:
 *
 *   npm run guard:branch
 */

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const checks = [
  ['npm', ['run', 'check:routes']],
  ['npm', ['run', 'audit:routes-unused']],
  ['npm', ['run', 'audit:closure']],
  ['npm', ['run', 'audit:loops']],
  ['npm', ['run', 'audit:module-matrix']],
  ['npm', ['run', 'audit:saas-contract']],
  ['npm', ['run', 'audit:product-surface-closure']],
  ['npm', ['run', 'audit:authz-gates']],
  ['npm', ['run', 'audit:navbar-smoke']],
  ['npm', ['run', 'audit:boy-wording']],
  ['npm', ['run', 'audit:i18n-hardcoded']],
  ['npm', ['run', 'audit:loop-runtime']],
  ['npm', ['run', 'audit:data-readiness']],
  ['npm', ['run', 'guard:ai-code']],
  ['npm', ['run', 'audit:cross-surface']],
  ['npm', ['run', 'audit:sse-correspondence']],
  ['npm', ['run', 'audit:product-verification']],
  ['npm', ['run', 'audit:engine-drift']],
  ['npm', ['run', 'audit:decision-chain']],
  ['npm', ['run', 'audit:platform-depth']],
  ['npm', ['run', 'audit:ux-closure']],
  ['npm', ['run', 'audit:visual-system']],
  ['npm', ['run', 'audit:defensive-ux']],
  ['npm', ['run', 'audit:enterprise-airgap']],
  ['npm', ['run', 'audit:edition-boundary']],
  ['npm', ['run', 'audit:community-export']],
  ['npm', ['run', 'audit:workspace-closure']],
  ['npm', ['run', 'compliance:ci']],
]

for (const [cmd, args] of checks) {
  const label = [cmd, ...args].join(' ')
  console.log(`\n==> ${label}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    console.error(`\nBranch guard failed at: ${label}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nBranch guard OK: routes, backend route ownership, closure, platform loops, Flyto2 split/merge module matrix, SaaS capability contract, product surface closure, authz gates, navbar smoke registry, BOY wording, runtime i18n hardcoded-English guard, data readiness, AI code quality, cross-surface coupling, SSE correspondence, product verification cockpit, engine-client drift, decision-chain moat, platform-depth closure, UX closure, visual-system guard, defensive UX guard, enterprise edition boundary, community export, workspace closure, and compliance evidence passed')
