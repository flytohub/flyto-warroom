import { spawnSync } from 'node:child_process'

const buildEnv = {
  ...process.env,
  VITE_ENGINE_URL: process.env.VITE_ENGINE_URL || 'https://engine.example.com',
  VITE_AUTOMATION_URL: process.env.VITE_AUTOMATION_URL || 'https://cloud.example.com',
  VITE_CORTEX_URL: process.env.VITE_CORTEX_URL || 'https://cortex.example.com',
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'release-placeholder',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'release.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'release-placeholder',
  VITE_GITHUB_CLIENT_ID: process.env.VITE_GITHUB_CLIENT_ID || 'release-placeholder',
  VITE_GITLAB_CLIENT_ID: process.env.VITE_GITLAB_CLIENT_ID || 'release-placeholder',
}

const steps = [
  ['npm', ['run', 'audit:eslint-warnings']],
  ['npx', ['tsc', '-b', '--noEmit']],
  ['npx', ['vitest', 'run']],
  ['npm', ['run', 'guard:branch']],
  ['npm', ['run', 'security:audit']],
  ['npm', ['run', 'build'], { env: buildEnv }],
  ['npm', ['run', 'release:bundle-budget']],
  ['npm', ['run', 'release:static-smoke']],
  ['npm', ['run', 'release:deploy-policy']],
  ['npm', ['run', 'audit:github-actions-startup']],
  ['npm', ['run', 'release:evidence']],
]

for (const [cmd, args, options = {}] of steps) {
  console.log(`\n==> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
