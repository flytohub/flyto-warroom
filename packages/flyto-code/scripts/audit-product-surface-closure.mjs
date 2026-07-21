#!/usr/bin/env node
/**
 * Product surface closure audit.
 *
 * Pins the "single product, multiple integrated surfaces" contract. A surface is
 * not closed unless its frontend, engine-client, backend route, authz registry,
 * query/SSE invalidation, and tests are present together.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE_ROOT = process.env.FLYTO_ENGINE_ROOT || path.resolve(ROOT, '..', 'flyto-engine')
const ENGINE_API = path.join(ENGINE_ROOT, 'api')
const REGISTRY_FILE = path.join(ENGINE_API, 'authz_routes_registry.go')

const failures = []
const warnings = []

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/')
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function readBackendRouteSources() {
  return fs
    .readdirSync(ENGINE_API)
    .filter((name) => name.endsWith('.go') && !name.endsWith('_test.go'))
    .sort()
    .map((name) => read(path.join(ENGINE_API, name)))
    .join('\n')
}

function existsFrom(root, file) {
  return fs.existsSync(path.join(root, file))
}

function requireFile(root, file, label) {
  if (!existsFrom(root, file)) {
    failures.push(`${label}: missing ${file}`)
    return ''
  }
  return read(path.join(root, file))
}

function requireContains(root, file, tokens, label) {
  const text = requireFile(root, file, label)
  if (!text) return
  for (const token of tokens) {
    if (!text.includes(token)) failures.push(`${label}: ${file} missing ${token}`)
  }
}

function requireAnyFile(root, files, label) {
  if (!files.some((file) => existsFrom(root, file))) {
    failures.push(`${label}: expected one of ${files.join(', ')}`)
  }
}

function requireRoute(router, registry, method, routePath, label, capability) {
  const live = `${method} ${routePath}`
  if (!router.includes(`"${live}"`)) {
    failures.push(`${label}: router missing ${live}`)
  }
  const entry = registry
    .split('\n')
    .find((line) => line.includes(`Method: "${method}"`) && line.includes(`Path: "${routePath}"`)) ?? ''
  if (!entry) {
    failures.push(`${label}: authz registry missing ${live}`)
  }
  if (capability) {
    if (!entry.includes(capability)) {
      failures.push(`${label}: authz registry ${live} missing capability ${capability}`)
    }
  }
}

function checkSurface(spec, engineAvailable, router, registry) {
  for (const file of spec.frontendFiles ?? []) requireFile(ROOT, file, spec.id)
  for (const item of spec.frontendContains ?? []) {
    requireContains(ROOT, item.file, item.tokens, spec.id)
  }
  for (const file of spec.frontendTests ?? []) requireFile(ROOT, file, `${spec.id} tests`)
  for (const item of spec.queryContains ?? []) {
    requireContains(ROOT, item.file, item.tokens, `${spec.id} query closure`)
  }

  if (!engineAvailable) return

  for (const file of spec.backendFiles ?? []) requireFile(ENGINE_ROOT, file, spec.id)
  for (const item of spec.backendContains ?? []) {
    requireContains(ENGINE_ROOT, item.file, item.tokens, `${spec.id} backend gate`)
  }
  for (const file of spec.backendTests ?? []) requireFile(ENGINE_ROOT, file, `${spec.id} backend tests`)
  for (const route of spec.routes ?? []) {
    requireRoute(router, registry, route.method, route.path, spec.id, route.capability)
  }
}

const surfaces = [
  {
    id: 'community_product_loop',
    frontendFiles: [
      'src-next/app/(control-panel)/flyto/projects/components/ProjectsPage.tsx',
      'src-next/app/(public)/(explore)/components/CommunityDemoView.tsx',
      'src-next/app/(public)/(explore)/route.tsx',
      'src-next/components/compounds/onboarding/CommunityProductLoopPanel.tsx',
      'src-next/lib/engine/platform/community.ts',
    ],
    frontendContains: [
      {
        file: 'src-next/app/(control-panel)/flyto/projects/components/ProjectsPage.tsx',
        tokens: ['CommunityProductLoopPanel', '<CommunityProductLoopPanel />'],
      },
      {
        file: 'src-next/app/(public)/(explore)/components/CommunityDemoView.tsx',
        tokens: ["env.authMode !== 'community'", '<CommunityProductLoopPanel enabled />'],
      },
      {
        file: 'src-next/app/App.tsx',
        tokens: ["'/community'"],
      },
      {
        file: 'src-next/components/compounds/onboarding/CommunityProductLoopPanel.tsx',
        tokens: ["env.authMode === 'community'", 'qk.platform.communityProductLoop()', 'getCEProductLoop'],
      },
    ],
    frontendTests: [
      'src-next/components/compounds/onboarding/__tests__/CommunityProductLoopPanel.test.tsx',
      'src-next/app/(public)/(explore)/components/__tests__/CommunityDemoView.test.tsx',
      'src-next/lib/engine/platform/__tests__/community.test.ts',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['communityProductLoop'] },
    ],
    backendFiles: [
      'api/routes_ce_public.go',
      'internal/ceproductloop/product_loop.go',
    ],
    backendTests: [
      'api/routes_ce_public_test.go',
      'api/authz_public_exception_test.go',
      'internal/ceproductloop/product_loop_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/ce/product-loop' },
    ],
  },
  {
    id: 'footprint',
    frontendFiles: [
      'src-next/components/compounds/footprint/FootprintGraphView.tsx',
      'src-next/components/compounds/footprint/SurfaceAttributionPanel.tsx',
      'src-next/lib/engine/code/footprintSurface.ts',
      'src-next/lib/footprintLoop.ts',
    ],
    frontendTests: [
      'src-next/components/compounds/footprint/__tests__/FootprintGraphView.test.tsx',
      'src-next/components/compounds/footprint/__tests__/SurfaceAttributionPanel.test.tsx',
      'src-next/lib/engine/code/__tests__/footprintSurface.test.ts',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['companyScope', 'threatSeed', 'surfaceEvidence'] },
      { file: 'src-next/lib/footprintLoop.ts', tokens: ['qk.footprint.companyScope', 'qk.footprint.threatSeed', 'qk.ctem.priorities'] },
    ],
    backendFiles: [
      'api/handlers_footprint.go',
      'api/handlers_footprint_surface.go',
      'api/handlers_company_scope.go',
    ],
    backendContains: [
      { file: 'api/handlers_company_scope.go', tokens: ['scan:trigger_external'] },
      { file: 'api/handlers_footprint_surface.go', tokens: ['org:settings'] },
    ],
    backendTests: [
      'api/handlers_footprint_test.go',
      'api/handlers_footprint_surface_evidence_test.go',
      'api/handlers_company_scope_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/code/orgs/{id}/footprint/surface' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/footprint/company-scope', capability: 'surface:read_external' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/footprint/company-scope', capability: 'scan:trigger_external' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/footprint/threat-seed-suggestions' },
    ],
  },
  {
    id: 'ctem',
    frontendFiles: [
      'src-next/components/compounds/exposure/CTEMActionsView.tsx',
      'src-next/components/compounds/exposure/CTEMFilterBar.tsx',
      'src-next/lib/engine/ctem/ctem.ts',
    ],
    frontendTests: [
      'src-next/components/compounds/exposure/__tests__/CTEMActionsView.test.tsx',
      'src-next/components/compounds/exposure/__tests__/CTEMFilterBar.test.tsx',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['priorities: ctemPriorities', 'enrichedIssuesAll', 'attackPaths'] },
      { file: 'src-next/hooks/useOrgEvents.ts', tokens: ['external_issue.updated', 'qk.ctem.priorities', 'qk.ctem.enrichedIssuesAll'] },
    ],
    backendFiles: [
      'api/handlers_ctem.go',
      'api/ctem_priority.go',
      'api/handlers_ctem_attack_paths.go',
    ],
    backendTests: [
      'api/handlers_ctem_test.go',
      'api/ctem_priority_dualread_test.go',
      'api/ctem_loop_closure_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/code/orgs/{id}/ctem/priorities' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/ctem/issues/mark-fixed' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/ctem/issues/assign' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/ctem/issues/verify' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/ctem-paths' },
    ],
  },
  {
    id: 'darkweb_threat_intel',
    frontendFiles: [
      'src-next/components/compounds/threat-intel/ThreatActorsView.tsx',
      'src-next/components/compounds/threat-intel/IoCLookupView.tsx',
      'src-next/components/compounds/threat-intel/ThreatIntelFeedStatus.tsx',
      'src-next/lib/engine/code/threatIntel.ts',
      'src-next/lib/threatIntelLoop.ts',
    ],
    frontendTests: [
      'src-next/components/compounds/threat-intel/__tests__/ThreatActorsView.test.tsx',
      'src-next/components/compounds/threat-intel/__tests__/IoCLookupView.test.tsx',
      'src-next/components/compounds/threat-intel/__tests__/SensorMapView.test.tsx',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['feedStatusAll', 'threatActorsAll', 'sensorObservationsAll'] },
      { file: 'src-next/lib/threatIntelLoop.ts', tokens: ['qk.threatIntel.feedStatusAll', 'qk.footprint.threatSeed'] },
    ],
    backendFiles: [
      'api/handlers_threat_intel.go',
      'api/handlers_threatintel_refresh.go',
      'api/handlers_leakcheck.go',
    ],
    backendTests: [
      'api/handlers_threat_intel_wire_test.go',
      'api/handlers_leakcheck_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/actors' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/malware' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/ransomware' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/iocs' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/sensor-map' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/threat-intel/feed-status' },
      { method: 'POST', path: '/api/v1/system/threat-intel/refresh', capability: 'capSystemThreatWrite' },
    ],
  },
  {
    id: 'company_subsidiary_scope',
    frontendFiles: [
      'src-next/components/compounds/settings/BusinessUnitsTab.tsx',
      'src-next/components/compounds/footprint/SurfaceAttributionPanel.tsx',
      'src-next/lib/engine/platform/businessUnits.ts',
    ],
    frontendTests: [
      'src-next/components/compounds/footprint/__tests__/SurfaceAttributionPanel.test.tsx',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['businessUnits', 'companyScope'] },
      { file: 'src-next/lib/footprintLoop.ts', tokens: ['qk.footprint.companyScope', 'qk.exposure.assetCoverage'] },
    ],
    backendFiles: [
      'api/handlers_business_units.go',
      'api/handlers_company_scope.go',
    ],
    backendContains: [
      { file: 'api/handlers_business_units.go', tokens: ['ActionScoreConfigure'] },
      { file: 'api/handlers_company_scope.go', tokens: ['scan:trigger_external'] },
    ],
    backendTests: [
      'api/handlers_business_units_test.go',
      'api/handlers_company_scope_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/code/orgs/{id}/business-units' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/business-units', capability: 'score:configure' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/business-units/{buId}/assign', capability: 'score:configure' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/business-units/unassign', capability: 'score:configure' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/footprint/company-scope', capability: 'surface:read_external' },
    ],
  },
  {
    id: 'code_ai_governance',
    frontendFiles: [
      'src-next/app/(control-panel)/flyto/workspace/components/pages/AISecurityCenterPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/AIGovernancePage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallActivityPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallAttackLabPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/ShadowAIPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/AIDLPPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/EvidenceReportsPage.tsx',
      'src-next/app/(control-panel)/flyto/workspace/components/pages/McpPage.tsx',
      'src-next/components/compounds/surface/mcp/AISecurityGovernanceViews.tsx',
      'src-next/components/compounds/surface/mcp/AgentFirewallActivityView.tsx',
      'src-next/components/compounds/surface/mcp/AgentFirewallAttackLab.tsx',
      'src-next/components/compounds/surface/mcp/McpView.tsx',
      'src-next/components/compounds/surface/mcp/McpPolicyView.tsx',
      'src-next/components/compounds/surface/mcp/McpEgressView.tsx',
      'src-next/components/compounds/repos/ScanControlsCard.tsx',
      'src-next/lib/engine/code/surfaces.ts',
    ],
    frontendContains: [
      {
        file: 'src-next/components/compounds/surface/mcp/AISecurityGovernanceViews.tsx',
        tokens: [
          'AISecurityCenterView',
          'AIGovernanceView',
          'ShadowAIView',
          'AIDLPView',
          'EvidenceReportsView',
          'EnterpriseReadinessPanel',
          'GovernanceApprovalPanel',
          'mcpEvidenceReportUrl',
          'qk.mcp.evidence',
        ],
      },
    ],
    frontendTests: [
      'src-next/components/compounds/surface/mcp/__tests__/AISecurityGovernanceViews.test.tsx',
      'src-next/components/compounds/surface/__tests__/McpOverviewView.test.tsx',
      'src-next/components/compounds/mcp/__tests__/MCPPolicySimulate.test.tsx',
      'src-next/components/compounds/repos/__tests__/RepoListView.test.tsx',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['aiGovernanceScore', 'aiGovernanceUseCases', 'repos'] },
      { file: 'src-next/hooks/useOrgEvents.ts', tokens: ['mcp.event.ingested', 'qk.mcp.evidence', 'qk.mcp.aiGovernanceScore'] },
    ],
    backendFiles: [
      'api/handlers_ai_governance.go',
      'api/handlers_mcp_overview.go',
      'api/handlers_mcp_guardian.go',
      'api/handlers_mcp_insights.go',
      'api/handlers_mcp_egress.go',
      'api/handlers_scan_upload.go',
    ],
    backendContains: [
      { file: 'api/handlers_ai_governance.go', tokens: ['ActionMCPConfigure'] },
      { file: 'api/handlers_mcp_insights.go', tokens: ['handleMCPEvidenceReport', 'handleMCPPolicySimulate', 'handleMCPSessionTimeline'] },
      { file: 'api/handlers_scan_upload.go', tokens: ['ActionScanTriggerCode', 'assertCodeModuleActive'] },
    ],
    backendTests: [
      'api/handlers_ai_governance_test.go',
      'api/handlers_mcp_guardian_test.go',
      'api/handlers_mcp_insights_test.go',
      'api/handlers_mcp_egress_test.go',
      'api/handlers_mcp_overview_test.go',
      'api/handlers_scan_upload_intel_test.go',
      'api/handlers_scans_module_gate_test.go',
    ],
    routes: [
      { method: 'GET', path: '/api/v1/code/orgs/{id}/ai-governance/score' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/ai-governance/use-cases' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/ai-governance/use-cases', capability: 'mcp:configure' },
      { method: 'PATCH', path: '/api/v1/code/ai-governance/use-cases/{useCaseId}', capability: 'mcp:configure' },
      { method: 'POST', path: '/api/v1/code/ai-governance/use-cases/{useCaseId}/request-approval', capability: 'mcp:configure' },
      { method: 'POST', path: '/api/v1/code/ai-governance/use-cases/{useCaseId}/approve', capability: 'mcp:configure' },
      { method: 'POST', path: '/api/v1/code/ai-governance/use-cases/{useCaseId}/reject', capability: 'mcp:configure' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/overview' },
      { method: 'POST', path: '/api/v1/agent-firewall/ingest', capability: 'store.APIKeyScopeMCPInvoke' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/mcp/ingest', capability: 'store.APIKeyScopeMCPInvoke' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/mcp/test-connection', capability: 'mcp:configure' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/policy' },
      { method: 'PUT', path: '/api/v1/code/orgs/{id}/mcp/policy', capability: 'mcp:configure' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/events/{eventId}/explanation' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/mcp/policy/simulate' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/sessions/{sessionId}/timeline' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/reports/evidence' },
      { method: 'GET', path: '/api/v1/code/orgs/{id}/mcp/risk/egress' },
      { method: 'POST', path: '/api/v1/code/repos/{id}/scan-upload' },
    ],
  },
  {
    id: 'upload_rbac',
    frontendFiles: [
      'src-next/components/compounds/_shared/ScanUploadDropzone.tsx',
      'src-next/components/compounds/settings/RBACTab.tsx',
      'src-next/lib/engine/system/rbac.ts',
      'src-next/hooks/useCapabilities.ts',
    ],
    frontendContains: [
      { file: 'src-next/components/compounds/_shared/ScanUploadDropzone.tsx', tokens: ['scan:trigger_code', 'repo:connect', 'permissionDenied', 'capsPending'] },
      { file: 'src-next/components/compounds/settings/RBACTab.tsx', tokens: ['system:rbac:read', 'system:rbac:write', 'canReadRBAC', 'canWriteRBAC'] },
    ],
    frontendTests: [
      'src-next/components/compounds/_shared/__tests__/ScanUploadDropzone.test.tsx',
      'src-next/components/compounds/settings/__tests__/RBACTab.test.tsx',
      'src-next/hooks/__tests__/useCapabilities.test.tsx',
    ],
    queryContains: [
      { file: 'src-next/lib/queryKeys.ts', tokens: ['rbacRoles', 'rbacUserCapabilities', 'capabilities'] },
      { file: 'src-next/hooks/useOrgEvents.ts', tokens: ['capabilities.changed', 'qk.platform.rbacUserCapabilities'] },
    ],
    backendFiles: [
      'api/handlers_scan_upload.go',
      'api/handlers_findings_import.go',
      'api/handlers_cspm.go',
      'api/handlers_rbac.go',
      'api/handlers_capabilities.go',
    ],
    backendContains: [
      { file: 'api/handlers_scan_upload.go', tokens: ['ActionScanTriggerCode', 'assertCodeModuleActive'] },
      { file: 'api/handlers_findings_import.go', tokens: ['ActionFindingImport', 'assertCodeModuleActive'] },
      { file: 'api/handlers_cspm.go', tokens: ['ActionScanTriggerCloud', 'assertModuleSourceActiveForOrg'] },
      { file: 'api/handlers_rbac.go', tokens: ['capSystemRBACRead', 'capSystemRBACWrite', 'userHasCapability'] },
      { file: 'api/handlers_capabilities.go', tokens: ['augmentCapabilitiesForUser', 'knownCapabilities', 'UserCapabilities'] },
    ],
    backendTests: [
      'api/handlers_scan_upload_intel_test.go',
      'api/handlers_findings_import_test.go',
      'api/handlers_scans_module_gate_test.go',
      'api/handlers_rbac_test.go',
      'api/handlers_capabilities_rbac_test.go',
    ],
    routes: [
      { method: 'POST', path: '/api/v1/code/repos/{id}/scan-upload' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/findings/import' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/cspm-upload' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/canonical-login' },
      { method: 'POST', path: '/api/v1/code/orgs/{id}/brand-references' },
      { method: 'GET', path: '/api/v1/system/rbac/roles', capability: 'capSystemRBACRead' },
      { method: 'POST', path: '/api/v1/system/rbac/roles', capability: 'capSystemRBACWrite' },
      { method: 'POST', path: '/api/v1/system/rbac/orgs/{orgID}/users/{userID}/roles', capability: 'capSystemRBACWrite' },
      { method: 'GET', path: '/api/v1/system/rbac/orgs/{orgID}/users/{userID}/capabilities', capability: 'capSystemRBACRead' },
    ],
  },
]

const engineAvailable = fs.existsSync(ENGINE_API) && fs.existsSync(REGISTRY_FILE)
if (!engineAvailable) {
  warnings.push(`flyto-engine sibling not found at ${rel(ENGINE_ROOT)}; backend route/authz checks skipped`)
}

const router = engineAvailable ? readBackendRouteSources() : ''
const registry = engineAvailable ? read(REGISTRY_FILE) : ''

for (const spec of surfaces) {
  checkSurface(spec, engineAvailable, router, registry)
}

requireAnyFile(ROOT, [
  'docs/platform-loops/platform-loop-registry.json',
], 'platform loop registry')

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`product surface closure warning: ${warning}`)
}

if (failures.length > 0) {
  console.error(`Product surface closure failed (${failures.length} issue(s)):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`Product surface closure OK: ${surfaces.length} product surfaces closed across frontend, backend, authz, query loops, and tests`)
