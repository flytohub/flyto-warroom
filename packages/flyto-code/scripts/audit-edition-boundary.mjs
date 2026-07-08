#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE = path.resolve(ROOT, '..')
const SRC = path.join(ROOT, 'src-next')

const violations = []

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    violations.push({ file: path.relative(WORKSPACE, file), reason: `missing required file: ${error.message}` })
    return ''
  }
}

function rel(file, base = WORKSPACE) {
  return path.relative(base, file).split(path.sep).join('/')
}

function expectIncludes(file, text, markers, reason) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      violations.push({ file: rel(file), reason: `${reason}: missing ${marker}` })
    }
  }
}

function expectRegex(file, text, pattern, reason) {
  if (!pattern.test(text)) {
    violations.push({ file: rel(file), reason })
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const engineCapabilitiesFile = path.join(WORKSPACE, 'flyto-engine', 'internal', 'permission', 'capabilities.go')
const engineEditionsFile = path.join(WORKSPACE, 'flyto-engine', 'internal', 'permission', 'editions.yaml')
const engineOfflineLicenseFile = path.join(WORKSPACE, 'flyto-engine', 'internal', 'offlinelicense', 'license.go')
const engineUpdateBundleFile = path.join(WORKSPACE, 'flyto-engine', 'internal', 'updatebundle', 'bundle.go')
const engineEnterpriseAuditFile = path.join(WORKSPACE, 'flyto-engine', 'api', 'handlers_enterprise_audit.go')
const engineEnterpriseRoutesFile = path.join(WORKSPACE, 'flyto-engine', 'api', 'routes_system_enterprise_audit.go')
const cloudRuntimeConfigFile = path.join(WORKSPACE, 'flyto-cloud', 'src', 'ui', 'web', 'backend', 'api', 'runtime_config.py')
const gatewayConfigFile = path.join(WORKSPACE, 'flyto-cloud', 'src', 'ui', 'web', 'backend', 'gateway', 'config.py')
const cloudAirgapComposeFile = path.join(WORKSPACE, 'flyto-cloud', 'deploy', 'enterprise-airgap', 'docker-compose.yml')
const cloudAirgapHelmConfigFile = path.join(WORKSPACE, 'flyto-cloud', 'deploy', 'enterprise-airgap', 'helm', 'templates', 'configmap.yaml')
const cloudAirgapHelmEngineFile = path.join(WORKSPACE, 'flyto-cloud', 'deploy', 'enterprise-airgap', 'helm', 'templates', 'engine.yaml')
const branchGuardFile = path.join(ROOT, 'scripts', 'ai-branch-guard.mjs')
const packageJsonFile = path.join(ROOT, 'package.json')
const communityExportScript = path.join(ROOT, 'scripts', 'export-community.mjs')
const communityExportManifest = path.join(ROOT, 'docs', 'open-core', 'community-export.manifest.json')
const editionBoundaryDoc = path.join(ROOT, 'docs', 'open-core', 'edition-boundary.md')
const communityExportDoc = path.join(ROOT, 'docs', 'open-core', 'community-export-manifest.md')
const airgapUpdateDoc = path.join(ROOT, 'docs', 'open-core', 'airgap-update-security.md')
const frontendCapabilitiesFile = path.join(SRC, 'lib', 'engine', 'platform', 'capabilities.ts')
const frontendUseCapabilitiesFile = path.join(SRC, 'hooks', 'useCapabilities.ts')
const frontendUseCapabilitiesTestFile = path.join(SRC, 'hooks', '__tests__', 'useCapabilities.test.tsx')
const frontendEnterpriseClientFile = path.join(SRC, 'lib', 'engine', 'system', 'enterprise.ts')
const frontendEnterpriseViewFile = path.join(SRC, 'components', 'compounds', 'system', 'EnterpriseControlPlaneView.tsx')

const engineCapabilities = readFile(engineCapabilitiesFile)
expectIncludes(engineCapabilitiesFile, engineCapabilities, [
  'Edition',
  'DeployMode',
  'EditionProviders',
  'LicenseClass',
  'HiddenSurfaces',
  'UnsupportedActions',
  'ApplyCurrentEditionProfile',
], 'engine capability snapshot must expose edition boundary fields')

const engineEditions = readFile(engineEditionsFile)
expectIncludes(engineEditionsFile, engineEditions, [
  'community:',
  'saas:',
  'self_hosted_online:',
  'enterprise_airgap:',
  'license_class: apache_2',
  'license_class: commercial',
  'auth: enterprise_jwt',
  'billing: offline_license',
  'storage: minio',
  'ai: local_openai_compatible',
  'threat_intel: offline_bundle',
  'billing.checkout',
  'marketplace.open',
], 'engine edition manifest must declare open-core and enterprise runtime boundaries')

const engineOfflineLicense = readFile(engineOfflineLicenseFile)
expectIncludes(engineOfflineLicenseFile, engineOfflineLicense, [
  'flyto-offline-license/v1',
  'ed25519',
  'VerifySigned',
  'ErrBadSignature',
  'ErrExpired',
  'ErrBlocked',
], 'engine must verify signed offline enterprise licenses fail-closed')

const engineUpdateBundle = readFile(engineUpdateBundleFile)
expectIncludes(engineUpdateBundleFile, engineUpdateBundle, [
  'flyto-update-bundle/v1',
  'VerifySigned',
  'VerifyFiles',
  'ErrDowngrade',
  'ErrPathTraversal',
  'ErrChecksum',
], 'engine must verify signed offline update bundles and payload checksums')

const engineEnterpriseAudit = readFile(engineEnterpriseAuditFile)
expectIncludes(engineEnterpriseAuditFile, engineEnterpriseAudit, [
  'enterpriseReadinessSchemaVersion',
  'handleEnterpriseReadiness',
  'VerifyEnterpriseAuditChain',
  'enterpriseReadinessDomains',
  'operator_action',
], 'engine enterprise control plane must expose readiness without fake success')

const engineEnterpriseRoutes = readFile(engineEnterpriseRoutesFile)
expectIncludes(engineEnterpriseRoutesFile, engineEnterpriseRoutes, [
  '/api/v1/system/enterprise/profile',
  '/api/v1/system/enterprise/readiness',
  '/api/v1/system/enterprise/audit/events',
  '/api/v1/system/enterprise/audit/export',
], 'engine enterprise routes must include profile, readiness, audit events, and export')

const cloudRuntimeConfig = readFile(cloudRuntimeConfigFile)
expectIncludes(cloudRuntimeConfigFile, cloudRuntimeConfig, [
  '"edition"',
  '"licenseClass"',
  '"providers"',
  '"unsupportedActions"',
  '"hiddenSurfaces"',
  '"enterprise_airgap"',
  '"self_hosted_online"',
  '"community"',
  '"threatIntel"',
], 'cloud runtime-config must expose additive edition/provider contract')

const gatewayConfig = readFile(gatewayConfigFile)
expectIncludes(gatewayConfigFile, gatewayConfig, [
  'self_hosted_online',
  'enterprise_airgap',
  'DeploymentMode.ENTERPRISE',
], 'gateway deployment detection must understand enterprise/private deploy modes')

const cloudAirgapCompose = readFile(cloudAirgapComposeFile)
expectIncludes(cloudAirgapComposeFile, cloudAirgapCompose, [
  'FLYTO_OFFLINE_LICENSE_FILE',
  'FLYTO_OFFLINE_LICENSE_PUBLIC_KEY_FILE',
  'FLYTO_UPDATE_BUNDLE_DIR',
  './license:/etc/flyto/license:ro',
  'update-bundles',
], 'enterprise compose must mount offline license and update bundle locations')

const cloudAirgapHelmConfig = readFile(cloudAirgapHelmConfigFile)
expectIncludes(cloudAirgapHelmConfigFile, cloudAirgapHelmConfig, [
  'FLYTO_OFFLINE_LICENSE_FILE',
  'FLYTO_OFFLINE_LICENSE_PUBLIC_KEY_FILE',
  'FLYTO_UPDATE_BUNDLE_DIR',
], 'enterprise Helm config must expose offline license and update bundle env')

const cloudAirgapHelmEngine = readFile(cloudAirgapHelmEngineFile)
expectIncludes(cloudAirgapHelmEngineFile, cloudAirgapHelmEngine, [
  'offline-license',
  'update-bundles',
  'readOnly: true',
  'persistentVolumeClaim',
], 'enterprise Helm engine deployment must mount offline license and update bundles')

const frontendCapabilities = readFile(frontendCapabilitiesFile)
expectIncludes(frontendCapabilitiesFile, frontendCapabilities, [
  'export type Edition',
  'export type LicenseClass',
  'export interface EditionProviders',
  'edition?: Edition',
  'deploy_mode?: string',
  'providers?: EditionProviders',
  'license_class?: LicenseClass',
  'hidden_surfaces?: string[]',
  'unsupported_actions?: string[]',
], 'frontend capability type must expose backend edition/provider snapshot fields')

const frontendUseCapabilities = readFile(frontendUseCapabilitiesFile)
expectIncludes(frontendUseCapabilitiesFile, frontendUseCapabilities, [
  'isEdition:',
  'providerFor:',
  'isSurfaceHidden:',
  'isActionUnsupported:',
  'hiddenSurfaceSet',
  'unsupportedActionSet',
], 'frontend capability helper must expose edition/provider and unsupported-action helpers')

const frontendUseCapabilitiesTest = readFile(frontendUseCapabilitiesTestFile)
expectIncludes(frontendUseCapabilitiesTestFile, frontendUseCapabilitiesTest, [
  "edition: 'enterprise_airgap'",
  "deploy_mode: 'enterprise_airgap'",
  "billing: 'offline_license'",
  "ai: 'local_openai_compatible'",
  "unsupported_actions: ['billing.checkout', 'marketplace.open']",
  "result.current.isEdition('enterprise_airgap')",
  "result.current.providerFor('billing')",
  "result.current.isActionUnsupported('billing.checkout')",
], 'frontend capability tests must prove edition/provider helpers consume engine snapshot fields')

const frontendEnterpriseClient = readFile(frontendEnterpriseClientFile)
expectIncludes(frontendEnterpriseClientFile, frontendEnterpriseClient, [
  'EnterpriseReadinessResponse',
  'getEnterpriseReadiness',
  '/api/v1/system/enterprise/readiness',
], 'frontend enterprise client must expose readiness API contract')

const frontendEnterpriseView = readFile(frontendEnterpriseViewFile)
expectIncludes(frontendEnterpriseViewFile, frontendEnterpriseView, [
  'getEnterpriseReadiness',
  'qk.platform.enterpriseReadiness',
  'EnterpriseReadinessPanel',
  'enterprise.readiness.title',
], 'frontend enterprise control plane must render readiness and use typed query keys')

const packageJson = JSON.parse(readFile(packageJsonFile) || '{}')
if (packageJson.scripts?.['audit:edition-boundary'] !== 'node scripts/audit-edition-boundary.mjs') {
  violations.push({ file: rel(packageJsonFile), reason: 'package.json must expose audit:edition-boundary' })
}
if (packageJson.scripts?.['audit:community-export'] !== 'node scripts/export-community.mjs --check') {
  violations.push({ file: rel(packageJsonFile), reason: 'package.json must expose audit:community-export' })
}
if (packageJson.scripts?.['export:community'] !== 'node scripts/export-community.mjs') {
  violations.push({ file: rel(packageJsonFile), reason: 'package.json must expose export:community' })
}

const branchGuard = readFile(branchGuardFile)
expectIncludes(branchGuardFile, branchGuard, [
  'audit:edition-boundary',
  'audit:community-export',
], 'branch guard must run edition boundary audit')

const exportScript = readFile(communityExportScript)
expectIncludes(communityExportScript, exportScript, [
  'flyto-community-export.audit.v1',
  '--check',
  'excludePathFragments',
  'SBOM.placeholder.json',
  'SECURITY.md',
], 'Community exporter must support check mode, denylist validation, SBOM placeholder, and security policy')

const exportManifest = readFile(communityExportManifest)
expectIncludes(communityExportManifest, exportManifest, [
  '"schema": "flyto-community-export/v1"',
  '"license": "Apache-2.0"',
  '"flyto-engine/internal/scanner"',
  '"flyto-engine/internal/codescan"',
  '"flyto-engine/internal/secrets"',
  '"offlinelicense"',
  '"updatebundle"',
  '"stripe"',
  '"firebase"',
], 'Community export manifest must include core scanner assets and exclude moat/SaaS providers')

const allowedFirebaseEngineFiles = new Set([
  'lib/engine/authToken.ts',
  'lib/engine/__tests__/client.test.ts',
  'lib/engine/__tests__/scoring.test.ts',
])

for (const file of walk(path.join(SRC, 'lib', 'engine'))) {
  const relative = rel(file, SRC)
  if (allowedFirebaseEngineFiles.has(relative)) continue
  const text = readFile(file)
  if (/@lib\/firebase|firebase\/auth|getIdToken\s*\(/.test(text)) {
    violations.push({ file: `flyto-code/src-next/${relative}`, reason: 'engine client must use @lib/engine/client authHeader/getEngineToken, not Firebase directly' })
  }
}

const enterpriseNginxFile = path.join(ROOT, 'nginx.enterprise-airgap.conf')
const enterpriseNginx = readFile(enterpriseNginxFile)
for (const external of ['firebaseio.com', 'googleapis.com', 'securetoken.googleapis.com', 'identitytoolkit.googleapis.com', 'flyto2.com', 'api.github.com', 'gitlab.com', 'cdn.jsdelivr.net', 'raw.githubusercontent.com']) {
  if (enterpriseNginx.includes(external)) {
    violations.push({ file: rel(enterpriseNginxFile), reason: `enterprise CSP must not hardcode ${external}` })
  }
}

const dockerfileFile = path.join(ROOT, 'Dockerfile')
const dockerfile = readFile(dockerfileFile)
expectIncludes(dockerfileFile, dockerfile, [
  'ARG VITE_AUTH_MODE',
  'ARG NGINX_CONF=nginx.conf',
], 'enterprise builds must choose auth mode and nginx profile')

const editionDoc = readFile(editionBoundaryDoc)
expectRegex(editionBoundaryDoc, editionDoc, /Community[\s\S]*Apache 2\.0/i, 'edition boundary doc must state Community default license')
expectRegex(editionBoundaryDoc, editionDoc, /Enterprise[\s\S]*(offline license|airgap|RBAC|SAML|OIDC)/i, 'edition boundary doc must reserve enterprise deployment/governance capabilities')
expectRegex(editionBoundaryDoc, editionDoc, /Core cannot import enterprise/i, 'edition boundary doc must define core-to-enterprise import rule')
expectRegex(editionBoundaryDoc, editionDoc, /capability snapshot/i, 'edition boundary doc must require UI gates from capability snapshot')

const exportDoc = readFile(communityExportDoc)
expectRegex(communityExportDoc, exportDoc, /Apache 2\.0/i, 'community export manifest must state default license')
expectRegex(communityExportDoc, exportDoc, /Include[\s\S]*(scanner|connector|policy|report)/i, 'community export manifest must list included community assets')
expectRegex(communityExportDoc, exportDoc, /Exclude[\s\S]*(offline license|advanced correlation|airgap|enterprise report)/i, 'community export manifest must exclude enterprise commercial assets')
expectRegex(communityExportDoc, exportDoc, /signed offline bundles|SBOM|secret scan|license scan/i, 'community export manifest must require signed bundle/SBOM/security checks before release')

const airgapDoc = readFile(airgapUpdateDoc)
expectRegex(airgapUpdateDoc, airgapDoc, /flyto-update-bundle\/v1/i, 'airgap update doc must define signed bundle schema')
expectRegex(airgapUpdateDoc, airgapDoc, /Ed25519/i, 'airgap update doc must define signature algorithm')
expectRegex(airgapUpdateDoc, airgapDoc, /downgraded|checksum|path-traversing/i, 'airgap update doc must define rejection cases')

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.edition-boundary-audit.v1', violations }, null, 2))
  process.exit(1)
}

console.log('edition boundary audit: PASS')
