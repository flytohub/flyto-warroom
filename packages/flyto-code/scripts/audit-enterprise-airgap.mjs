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

function walkAll(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkAll(full, out)
    else out.push(full)
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
for (const marker of [
  'listen       8080;',
  'location = /healthz',
  'application/json',
  'location /automation/',
  'resolver ${FLYTO_NGINX_RESOLVER} valid=10s ipv6=off;',
  'set $enterprise_backend http://enterprise-backend:9191;',
  'set $automation_backend http://automation-api:8080;',
  'set $engine_backend http://engine:8080;',
  'proxy_pass $automation_backend;',
  'proxy_set_header Upgrade $http_upgrade;',
]) {
  if (!enterpriseNginx.includes(marker)) {
    violations.push({ file: 'nginx.enterprise-airgap.conf', reason: `enterprise proxy contract is missing ${marker}` })
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
if (!dockerfile.includes('ARG FLYTO_PUBLIC_MODE')) {
  violations.push({ file: 'Dockerfile', reason: 'enterprise builds must be able to set VITE_AUTH_MODE through neutral FLYTO_PUBLIC_MODE' })
}
if (!dockerfile.includes('VITE_AUTH_MODE="${FLYTO_PUBLIC_MODE}"')) {
  violations.push({ file: 'Dockerfile', reason: 'Docker build must map FLYTO_PUBLIC_MODE to VITE_AUTH_MODE during frontend compilation' })
}
if (!dockerfile.includes('ARG NGINX_CONF=nginx.conf')) {
  violations.push({ file: 'Dockerfile', reason: 'enterprise builds must be able to select nginx.enterprise-airgap.conf' })
}
if (!dockerfile.includes('COPY vendor/@flyto/design-tokens /app/vendor/@flyto/design-tokens')) {
  violations.push({ file: 'Dockerfile', reason: 'Docker build must install the tracked design-token package without a sibling checkout' })
}
if (dockerfile.includes('flyto-design-tokens-pkg')) {
  violations.push({ file: 'Dockerfile', reason: 'Docker build must not depend on a mutable, pre-generated design-token directory' })
}
if (!dockerfile.includes('FROM nginxinc/nginx-unprivileged:alpine@sha256:')) {
  violations.push({ file: 'Dockerfile', reason: 'runtime must use a digest-pinned unprivileged nginx image' })
}
if (!dockerfile.includes('FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:')) {
  violations.push({ file: 'Dockerfile', reason: 'build stage must be native to the builder and digest-pinned' })
}
for (const marker of [
  'NGINX_ENVSUBST_FILTER=^FLYTO_',
  'FLYTO_NGINX_RESOLVER=127.0.0.11',
  'COPY --chown=101:0 ${NGINX_CONF} /etc/nginx/templates/default.conf.template',
  'USER 101:101',
  'EXPOSE 8080',
  'http://127.0.0.1:8080/healthz',
]) {
  if (!dockerfile.includes(marker)) {
    violations.push({ file: 'Dockerfile', reason: `non-root runtime contract is missing ${marker}` })
  }
}

const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
if (!packageJson.includes('"@flyto/design-tokens": "file:./vendor/@flyto/design-tokens"')) {
  violations.push({ file: 'package.json', reason: 'local design tokens must resolve from the tracked vendor directory' })
}

const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.next.ts'), 'utf8')
for (const marker of [
  "'community'",
  "'local_jwt'",
  "'enterprise'",
  "'enterprise_jwt'",
  "'enterprise_airgap'",
  "'firebase/auth': firebaseEnterpriseStub",
  "'firebase/app': firebaseEnterpriseStub",
  "'firebase/compat': firebaseEnterpriseStub",
  "sourcemap: sentryPlugin ? 'hidden' : false",
  "const airgapBuild = authMode === 'enterprise_airgap'",
  '__AIRGAP_BUILD__: JSON.stringify(airgapBuild)',
  'localGlobeAssetsPlugin()',
]) {
  if (!viteConfig.includes(marker)) {
    violations.push({ file: 'vite.config.next.ts', reason: `enterprise Firebase-free build contract is missing ${marker}` })
  }
}

const indexHtml = fs.readFileSync(path.join(ROOT, 'index-next.html'), 'utf8')
for (const marker of ['<!-- flyto:external-fonts:start -->', '<!-- flyto:external-fonts:end -->']) {
  if (!indexHtml.includes(marker)) {
    violations.push({ file: 'index-next.html', reason: `airgap font isolation marker is missing ${marker}` })
  }
}

const i18n = fs.readFileSync(path.join(SRC, 'lib', 'i18n.ts'), 'utf8')
if (!i18n.includes("const CDN_ENDPOINTS = __AIRGAP_BUILD__ ? ['/i18n']")) {
  violations.push({ file: 'lib/i18n.ts', reason: 'airgap i18n must only use the same-origin bundle' })
}
if (!i18n.includes('import.meta.env.DEV || __AIRGAP_BUILD__')) {
  violations.push({ file: 'lib/i18n.ts', reason: 'airgap locale flags must be same-origin' })
}

const globe = fs.readFileSync(path.join(SRC, 'components', 'compounds', 'threat-intel', 'WorldHeatGlobe.tsx'), 'utf8')
if (globe.includes('unpkg.com/three-globe') || !globe.includes('/assets/globe/earth-blue-marble.jpg')) {
  violations.push({ file: 'components/compounds/threat-intel/WorldHeatGlobe.tsx', reason: 'globe textures must be bundled as same-origin assets' })
}

const artifactArg = process.argv.indexOf('--artifact-dir')
if (artifactArg !== -1) {
  const requestedDir = process.argv[artifactArg + 1]
  const artifactDir = requestedDir ? path.resolve(ROOT, requestedDir) : ''
  if (!artifactDir || !fs.existsSync(artifactDir) || !fs.statSync(artifactDir).isDirectory()) {
    violations.push({ file: requestedDir || '<missing>', reason: 'enterprise artifact directory does not exist' })
  } else {
    const artifactFiles = walkAll(artifactDir)
    const textFiles = artifactFiles.filter(file => /\.(?:css|html|js|json)$/i.test(file))
    const bannedRuntimeOrigins = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://unpkg.com/three-globe',
      'https://cdn.jsdelivr.net/gh/flytohub/flyto-i18n',
      'https://raw.githubusercontent.com/flytohub/flyto-i18n',
      'firebaseio.com',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
    ]
    for (const file of textFiles) {
      const text = fs.readFileSync(file, 'utf8')
      for (const origin of bannedRuntimeOrigins) {
        if (text.includes(origin)) {
          violations.push({ file: path.relative(artifactDir, file), reason: `airgap artifact contains automatic external runtime origin ${origin}` })
        }
      }
    }
    for (const file of artifactFiles.filter(file => file.endsWith('.map'))) {
      violations.push({ file: path.relative(artifactDir, file), reason: 'release artifact must not contain source maps' })
    }
    for (const asset of [
      'earth-blue-marble.jpg',
      'earth-day.jpg',
      'earth-topology.png',
      'LICENSE-three-globe.txt',
    ]) {
      const relative = path.join('assets', 'globe', asset)
      const target = path.join(artifactDir, relative)
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        violations.push({ file: relative, reason: 'required same-origin globe asset is missing' })
      }
    }
  }
}

const firebaseShim = fs.readFileSync(path.join(SRC, 'lib', 'shims', 'firebaseEnterprise.ts'), 'utf8')
if (!firebaseShim.includes('Firebase authentication is unavailable in this deployment')) {
  violations.push({ file: 'lib/shims/firebaseEnterprise.ts', reason: 'enterprise Firebase shim must fail closed' })
}

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.enterprise-airgap-audit.v1', violations }, null, 2))
  process.exit(1)
}

console.log('enterprise airgap audit: PASS')
