#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const API_KEYS_TAB = path.join(SRC, 'components', 'compounds', 'settings', 'APIKeysTab.tsx')

const allowedFirebaseEngineFiles = new Set([
  'lib/engine/authToken.ts',
  'lib/engine/__tests__/client.test.ts',
  'lib/engine/__tests__/scoring.test.ts',
])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function rel(abs) {
  return path.relative(SRC, abs).split(path.sep).join('/')
}

const violations = []
for (const file of walk(path.join(SRC, 'lib', 'engine'))) {
  const r = rel(file)
  if (allowedFirebaseEngineFiles.has(r)) continue
  const text = fs.readFileSync(file, 'utf8')
  if (/@lib\/firebase|firebase\/auth|getIdToken\s*\(/.test(text)) {
    violations.push({ file: r, reason: 'engine client must use @lib/engine/client authHeader/getEngineToken, not Firebase directly' })
  }
}

const enterpriseNginx = fs.readFileSync(path.join(ROOT, 'nginx.enterprise-airgap.conf'), 'utf8')
for (const external of ['firebaseio.com', 'googleapis.com', 'securetoken.googleapis.com', 'identitytoolkit.googleapis.com', 'flyto2.com', 'api.github.com', 'gitlab.com', 'cdn.jsdelivr.net', 'raw.githubusercontent.com']) {
  if (enterpriseNginx.includes(external)) {
    violations.push({ file: 'nginx.enterprise-airgap.conf', reason: `enterprise CSP must not hardcode ${external}` })
  }
}

const apiKeysTab = fs.readFileSync(API_KEYS_TAB, 'utf8')
for (const helper of ['runtimeEventsEndpoint', 'ciCheckEndpoint', 'scanUploadEndpoint', 'mcpIngestEndpoint']) {
  if (!apiKeysTab.includes(helper)) {
    violations.push({ file: rel(API_KEYS_TAB), reason: `API key usage snippets must use deployment-aware ${helper}` })
  }
}
if (apiKeysTab.includes('warroom.flyto2.com')) {
  violations.push({
    file: rel(API_KEYS_TAB),
    reason: 'API key usage snippets must not hardcode SaaS host; use VITE_ENGINE_URL-derived helpers',
  })
}

const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
if (!dockerfile.includes('ARG VITE_AUTH_MODE')) {
  violations.push({ file: 'Dockerfile', reason: 'enterprise builds must be able to set VITE_AUTH_MODE' })
}
if (!dockerfile.includes('ARG NGINX_CONF=nginx.conf')) {
  violations.push({ file: 'Dockerfile', reason: 'enterprise builds must be able to select nginx.enterprise-airgap.conf' })
}

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.enterprise-airgap-audit.v1', violations }, null, 2))
  process.exit(1)
}

console.log('enterprise airgap audit: PASS')
