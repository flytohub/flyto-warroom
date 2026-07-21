/**
 * flyto-engine API client — barrel re-export.
 *
 * Consumers import from `@lib/engine` and get everything; internally
 * split by product domain for maintainability (reorg 2026-05-19):
 *
 *   ctem/      — External CTEM domain (mitigations, attack paths, vendors,
 *                 visual phishing, asset evidence, compliance, scoring-audit,
 *                 asset-map, upstream data — peer baseline / MTTR / forecast)
 *   code/      — Internal code product (repos, scans, autofix, findings,
 *                 verify, arch, CI, container/IaC/license/malware/pentest)
 *   scoring/   — Unified scoring engine + per-org weight config
 *   reports/   — Report templates / components / VA report / source registry
 *   history/   — Activity feed + alert/verify history
 *   platform/  — Org/auth/system surfaces (orgs, members, BU, API keys,
 *                 scan approvals, scan credentials, monitoring, budget)
 *
 * Cross-cutting modules stay at root: client.ts, typed-client.ts,
 * openapi-schema.gen.ts, github.ts, pipelineLog.ts.
 *
 * `apiExplore.ts` is intentionally NOT exported here — public /explore
 * portal calls should import it directly from `@lib/engine/apiExplore`
 * so the dependency graph makes the privacy boundary obvious.
 */

export * from './client'
export * from './github'
export * from './pipelineLog'

export * from './platform/orgs'
export * from './platform/apiKeys'
export * from './platform/capabilities'
export * from './platform/businessUnits'
export * from './platform/scanApprovals'
export * from './platform/scanCredentials'
export * from './platform/monitoring'
export * from './platform/operations'
export * from './platform/campaignBudget'
export * from './platform/news'
export * from './platform/launchpad'
export * from './platform/notifications'
export * from './platform/projectCapabilities'
export * from './platform/community'
export * from './system/enterprise'

export * from './history/history'
export * from './history/history-feed'

export * from './reports/reports'
export * from './reports/report-sources'
export * from './reports/vaReport'

export * from './ctem/ctem'
export * from './ctem/blastGraph'
export * from './ctem/aiFix'
export * from './ctem/evidenceBinder'
export * from './ctem/upstreamData'
export * from './ctem/assetEvidence'
export * from './ctem/visualSimilarity'
export * from './ctem/scoringAudit'
export * from './ctem/vendors'
export * from './ctem/compliance'
export * from './ctem/asset-map'

export * from './scoring/scoring'
export * from './scoring/scoringConfig'

export * from './code/repos'
export * from './code/arch'
export * from './code/verify'
export * from './code/autofix'
export * from './code/ci'
export * from './code/findingsByPackage'
export * from './code/findings'
export * from './code/threatIntel'
export * from './code/surfaces'
export * from './code/dashboard'
export * from './code/issues'
export * from './code/attackPaths'
export * from './code/footprintGraph'
export * from './code/footprintSurface'
export * from './code/security'
export * from './code/containerScan'
export * from './code/cloud'
export * from './code/remediation'
export * from './code/pentest'
export * from './code/unifiedAsset'
export * from './code/timeline'
export * from './code/warroomVerification'
