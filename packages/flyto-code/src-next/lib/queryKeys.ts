/**
 * Centralised React Query key factory — domain-grouped.
 *
 * Every consumer that reads org-scoped engine data AND every invalidation
 * site in `useOrgEvents` must build its key through this module, so a typo on
 * one side can't silently desync from the other. The `as const` returns make
 * each key a structural tuple type, so a typo becomes a compile error.
 *
 * Adding a new org-scoped read:
 *   1. Add a builder under the right domain here.
 *   2. Use it: `useQuery({ queryKey: qk.<domain>.<entity>(orgId), ... })`
 *      (or a typed hook in `hooks/engine/`).
 *   3. If an SSE event should refresh it, invalidate the SAME builder in the
 *      matching `useOrgEvents` case.
 *
 * The six original top-level builders (attackSurface, externalPosture, …) are
 * kept FLAT for back-compat — useOrgEvents + ~10 call sites import them as
 * `qk.externalPosture(orgId)`. Everything else is grouped by domain. Inline
 * string-literal keys are migrated into this factory one domain at a time
 * (see docs/ARCH or the queryKey catalog); `noAdHocTransport` + future guards
 * keep new code on the factory.
 *
 * Known cache bugs to fix during per-domain migration (read-literal ≠
 * invalidation-literal): pulse (org-pulse vs pulse), pentest projects
 * (pentest-projects vs pentests), scanSchedule singular/plural, org-issues
 * never invalidated. Builders below pick ONE canonical literal per datum.
 */

type OrgKey<T extends string> = readonly [T, string | undefined]

// ── Original six (FLAT, back-compat — do not move into a domain) ──
const attackSurface = (o: string | undefined): OrgKey<'attack-surface'> => ['attack-surface', o] as const
const attackSurfaceVariant = (o: string | undefined, variant: 'confirmed' | 'with-candidates') =>
  ['attack-surface', o, variant] as const
const externalPosture = (o: string | undefined): OrgKey<'external-posture'> => ['external-posture', o] as const
const externalPostureKernel = (o: string | undefined): OrgKey<'external-posture-kernel'> => ['external-posture-kernel', o] as const
const externalIssues = (o: string | undefined): OrgKey<'external-issues'> => ['external-issues', o] as const
const assetMapKernel = (o: string | undefined): OrgKey<'asset-map-kernel'> => ['asset-map-kernel', o] as const
const assetMapKernelMode = (o?: string, mode?: 'leads' | 'confirmed') => ['asset-map-kernel', o, mode] as const
const computedScore = (o: string | undefined): OrgKey<'computed-score'> => ['computed-score', o] as const
const scoreHistory = (o?: string, days?: number) => (
  typeof days === 'number'
    ? ['unified-score-history', o, days] as const
    : ['unified-score-history', o] as const
)
const scoreEvents = (o?: string, days?: number | string) => (
  days == null
    ? ['score-events', o] as const
    : ['score-events', o, String(days)] as const
)
const ctemPriorities = (o?: string, scope?: string) => (
  scope
    ? ['ctem-priorities', o, scope] as const
    : ['ctem-priorities', o] as const
)
const footprintActionable = (o?: string, tier?: string, refreshKey?: number | string) => {
  if (tier == null) return ['footprint-actionable', o] as const
  if (refreshKey == null) return ['footprint-actionable', o, tier] as const
  return ['footprint-actionable', o, tier, refreshKey] as const
}
const footprintNarrative = (o?: string, refreshKey?: number | string) => (
  refreshKey == null
    ? ['footprint-narrative', o] as const
    : ['footprint-narrative', o, refreshKey] as const
)
const footprintCandidatePaths = (o?: string, limit?: number) => (
  typeof limit === 'number'
    ? ['footprint-candidate-paths', o, limit] as const
    : ['footprint-candidate-paths', o] as const
)
const boyAttackPathCandidates = (o?: string, limit?: number) => (
  typeof limit === 'number'
    ? ['boy-attack-path-candidates', o, limit] as const
    : ['boy-attack-path-candidates', o] as const
)
const boyAttackPathCandidateDetail = (o?: string, hypothesisId?: string) => (
  hypothesisId
    ? ['boy-attack-path-candidate-detail', o, hypothesisId] as const
    : ['boy-attack-path-candidate-detail', o] as const
)
const boyValidationTasks = (o?: string, limit?: number) => (
  typeof limit === 'number'
    ? ['boy-validation-tasks', o, limit] as const
    : ['boy-validation-tasks', o] as const
)
const boyBreakthroughPaths = (o?: string, limit?: number) => (
  typeof limit === 'number'
    ? ['boy-breakthrough-paths', o, limit] as const
    : ['boy-breakthrough-paths', o] as const
)
const boyBreakthroughPathDetail = (o?: string, pathId?: string) => (
  pathId
    ? ['boy-breakthrough-path-detail', o, pathId] as const
    : ['boy-breakthrough-path-detail', o] as const
)
const researchFootprint = (o?: string, selectorKey?: string) => (
  selectorKey
    ? ['research-footprint', o, selectorKey] as const
    : ['research-footprint', o] as const
)
const footprintSurface = (o?: string, pool?: string) => (
  pool
    ? ['footprint-surface', o, pool] as const
    : ['footprint-surface', o] as const
)
const footprintSurfaceEvidence = (o?: string, resourceId?: string) => (
  resourceId
    ? ['footprint-surface-evidence', o, resourceId] as const
    : ['footprint-surface-evidence', o] as const
)
const footprintCompanyScope = (o?: string) => ['footprint-company-scope', o] as const
const domainAssetEvidence = (o?: string, assetType?: string, assetKey?: string) => {
  if (assetKey != null) return ['asset-evidence', o, assetType, assetKey] as const
  if (assetType != null) return ['asset-evidence', o, assetType] as const
  return ['asset-evidence', o] as const
}

export const qk = {
  // flat aliases (original six)
  attackSurface, attackSurfaceVariant, externalPosture, externalPostureKernel,
  externalIssues, assetMapKernel, assetMapKernelMode, computedScore,

  repos: {
    connected: (o?: string) => ['repos', o] as const,
    connectedAll: () => ['repos'] as const,
    scans: (repoId?: string) => ['repo-scans', repoId] as const,
    scansAll: () => ['repo-scans'] as const,
    scanResults: (scanId?: string) => ['scan-results', scanId] as const,
    health: (repoId?: string) => ['health', repoId] as const,
    profile: (repoId?: string) => ['profile', repoId] as const,
    healthSummary: (o?: string) => ['healthSummary', o] as const,
    fixPlan: (repoId?: string) => ['fix-plan', repoId] as const,
    apiDefinitions: (o?: string) => ['api-definitions', o] as const,
    apiDefinitionsForDomain: (o?: string, domain?: string) => ['api-definitions', o, domain] as const,
    archMap: (o?: string) => ['arch-map', o] as const,
    scanDiff: (o?: string) => ['org-scan-diff', o] as const,
    deadCode: (o?: string) => ['org-dead-code', o] as const,
    dependencies: (o?: string) => ['org-dependencies', o] as const,
    tokenStatus: (o?: string, provider = 'github') => ['orgTokenStatus', o, provider] as const,
    githubConnection: (o?: string) => ['github-connection', o] as const,
    githubOrgs: (o?: string) => ['github-orgs', o] as const,
    githubOrgMembers: (o?: string, login?: string) => ['github-org-members', o, login] as const,
    prActivity: (o?: string, login?: string) => ['pr-activity', o, login] as const,
    detail: (o?: string, owner?: string, name?: string) => ['repo-detail', o, owner, name] as const,
    archDetail: (repoId?: string) => ['repo-arch-detail', repoId] as const,
    findings: (repoId?: string) => ['repo-findings', repoId] as const,
  },
  pulse: {
    feed: (o?: string) => ['pulse', o] as const,
    aiPanel: (o?: string) => ['pulse', o, 'ai-panel', 5] as const,
    org: (o?: string, window = '', pageSize = 20) => ['pulse', o, window, pageSize] as const,
    dashboard: (o?: string) => ['pulse', o, 'dashboard'] as const,
    manager: (o?: string) => ['pulse', o, 'manager', 200] as const,
    fixQueue: (o?: string) => ['pulse', o, 'fix-queue', 50] as const,
  },

  security: {
    issues: (o?: string) => ['issues', o] as const,
    issuesEnriched: (o?: string) => ['issues', o, 'enriched'] as const,
    // Filtered variant — severity/type/repo are applied server-side (P2-8), so
    // they belong in the key. Prefix-compatible with issuesEnriched so the SSE
    // handler's exact:false invalidation on ['issues', o, 'enriched'] still hits.
    issuesEnrichedFiltered: (
      o?: string,
      severity?: string,
      type?: string,
      repo?: string,
    ) => ['issues', o, 'enriched', severity ?? '', type ?? '', repo ?? ''] as const,
    orgIssuesOpen: (o?: string, status = 'open') => ['issues', o, 'org', status] as const,
    repoVerifications: (repoId?: string) => ['repo-verifications', repoId] as const,
    repoVerificationsAll: () => ['repo-verifications'] as const,
    verifyTargets: (repoId?: string) => ['verify-targets', repoId] as const,
    verifyExplain: (execId?: string) => ['verify-explain', execId] as const,
    workflowExecution: (execId?: string) => ['workflow-execution', execId] as const,
    workflowExecutionAll: () => ['workflow-execution'] as const,
    repoVerifyExecutions: (repoId?: string) => ['repo-verify-exec', repoId] as const,
    verifyHistory: (repoId?: string, cve?: string, pkg?: string) => ['verify-history', repoId, cve, pkg] as const,
    news: () => ['security-news'] as const,
    findingsByPackage: (o?: string, pkg?: string | null, type?: string | null) => ['finding-by-package', o, pkg, type] as const,
    unifiedFinding: (o?: string, fp?: string | null) => ['unified-finding', o, fp] as const,
    alertBlastGraph: (alertId?: string | null) => ['alert-blast-graph', alertId] as const,
    history: (kind: string, ...params: readonly unknown[]) => ['history', kind, ...params] as const,
    alerts: (o?: string, status?: string) => (
      status ? ['alerts', o, status] as const : ['alerts', o] as const
    ),
    enrichedAlerts: (o?: string, status?: string) => (
      status ? ['alerts', o, 'enriched', status] as const : ['alerts', o, 'enriched'] as const
    ),
    unifiedFindingAll: (o?: string) => ['unified-finding', o] as const,
    alertBlastGraphAll: () => ['alert-blast-graph'] as const,
  },

  autofix: {
    findings: (o?: string) => ['autofix-findings', o] as const,
    findingsCount: (o?: string) => ['autofix-findings-count', o] as const,
    finding: (o?: string, id?: string) => ['autofix-finding', o, id] as const,
    runs: (o?: string) => ['autofix-runs', o] as const,
    gates: (o?: string, runId?: string) => ['autofix-gates', o, runId] as const,
    rules: (o?: string) => ['autofix-rules', o] as const,
    promotions: (o?: string) => ['autofix-promotions', o] as const,
    aiProposals: (repoId?: string) => ['ai-proposals', repoId] as const,
    aiFixContext: (repoId?: string) => ['ai-fix-context', repoId] as const,
  },

  remediation: {
    catalog: (o?: string) => ['remediation-catalog', o] as const,
    targets: (o?: string, surface?: string, status?: string) => ['remediation-targets', o, surface ?? '', status ?? ''] as const,
    targetsAll: (o?: string) => ['remediation-targets', o] as const,
    plans: (o?: string, targetId?: string, status?: string) => ['remediation-plans', o, targetId ?? '', status ?? ''] as const,
    plansAll: (o?: string) => ['remediation-plans', o] as const,
    runs: (o?: string, targetId?: string, planId?: string, action?: string) => ['remediation-runs', o, targetId ?? '', planId ?? '', action ?? ''] as const,
    runsAll: (o?: string) => ['remediation-runs', o] as const,
    artifacts: (o?: string, targetId?: string, planId?: string, runId?: string) => ['remediation-artifacts', o, targetId ?? '', planId ?? '', runId ?? ''] as const,
    artifactsAll: (o?: string) => ['remediation-artifacts', o] as const,
  },

  exposure: {
    findingsFacets: (o?: string, includeResolved?: boolean) => ['findings-facets', o, includeResolved] as const,
    findingsListAll: (o?: string) => ['findings', o] as const,
    findingsList: (o?: string, f?: Record<string, unknown>) => ['findings', o, f] as const,
    findingsPage: (
      o?: string,
      severity?: string,
      grade?: string,
      importance?: string,
      source?: string,
      category?: string,
      threatOnly?: boolean,
      includeResolved?: boolean,
      searchTerm?: string,
      page?: number,
    ) => ['findings', o, severity, grade, importance, source, category, threatOnly, includeResolved, searchTerm, page] as const,
    findingsBase: (o?: string) => ['findings', o] as const,
    findingHistoryBase: (o?: string) => ['finding-history', o] as const,
    findingHistory: (o?: string, id?: string) => ['finding-history', o, id] as const,
    findingAssets: (o?: string, id?: string) => ['finding-assets', o, id] as const,
    leakExposure: (o?: string) => ['leak-exposure', o] as const,
    monitoringEvents: (o?: string, limit?: number) => ['monitoring-events', o, limit] as const,
    postureSnapshots: (o?: string, days?: number) => ['posture-snapshots', o, days] as const,
    discoveryRuns: (o?: string, limit?: number) => ['discovery-runs', o, limit] as const,
    verifierSourceHealth: (o?: string, hours?: number) => ['verifier-source-health', o, hours] as const,
    discoveriesActive: (o?: string) => ['discoveries-active', o] as const,
    unifiedAsset: (o?: string, domain?: string | null) => ['unified-asset', o, domain] as const,
    triageStats: (o?: string) => ['triage-stats', o] as const,
    findingsManagerFacets: (o?: string) => ['findings-facets', o, 'manager'] as const,
    findingsManagerRollup: (o?: string) => ['findings', o, 'manager-rollup'] as const,
    findingsManagerHistory: (o?: string) => ['findings', o, 'manager-history'] as const,
    assetCoverage: (o?: string) => ['asset-coverage', o] as const,
    brandManagerAttackSurface: (o?: string) => ['brand-manager-attack-surface', o] as const,
    brandManagerVisualSimilarity: (o?: string) => ['brand-manager-visual-sim', o] as const,
    brandProtection: (o?: string) => ['brand-protection', o] as const,
    brandProtectionCampaigns: (o?: string) => ['brand-protection-campaigns', o] as const,
  },

  ctem: {
    priorities: ctemPriorities,
    enrichedIssues: (o?: string, scope = 'ctem') => ['enriched-issues', o, scope] as const,
    // Org-scoped PREFIX for the enriched-issues family (drops the local-only
    // `scope` discriminator). Use with `exact:false` so an SSE invalidation
    // busts every scoped variant (manager / ctem / …) in one call — the
    // scoped `enrichedIssues` key above never prefix-matches the bare
    // ['issues', orgId] key the events lane used to invalidate, so without
    // this the manager / CTEM views stayed stale after scan / autofix /
    // verify / issue.status_changed events.
    enrichedIssuesAll: (o?: string) => ['enriched-issues', o] as const,
    attackPaths: (o?: string) => ['attack-paths', o] as const,
    attackPathsFiltered: (o?: string, minConfidence?: string, sort?: string) => ['attack-paths', o, minConfidence, sort] as const,
    attackPathsManager: (o?: string) => ['attack-paths-manager', o] as const,
    mitigations: (o?: string) => ['mitigations', o] as const,
    mitigationEvidence: (o?: string, id?: string) => ['mitigation-evidence', o, id] as const,
    slaBudget: (o?: string, buFilter?: string) => ['sla-budget', o, buFilter] as const,
    mttrHistory: (o?: string) => ['mttr-history', o] as const,
    vendors: (o?: string) => ['vendors', o] as const,
    vendorRiskSummary: (o?: string) => ['vendor-risk-summary', o] as const,
  },

  scoring: {
    peerBaseline: (o?: string, sector?: string) => ['peer-baseline', o, sector] as const,
    scoreForecast: (o?: string) => ['score-forecast', o] as const,
    peerCorpus: () => ['peer-corpus'] as const,
    benchmark: (o?: string) => ['org-benchmark', o] as const,
    compliance: (o?: string) => ['org-compliance', o] as const,
    scoreHistory,
    scoreEvents,
    config: (o?: string) => ['scoring-config', o] as const,
  },

  domains: {
    scoreEvents: (projectId?: string, days?: number) => ['domain-score-events', projectId, days] as const,
    analysis: (projectId?: string) => ['domain-analysis', projectId] as const,
    managerPostureKernel: (o?: string) => ['domains-mgr', 'posture-kernel', o] as const,
    assetEvidence: domainAssetEvidence,
  },

  pentest: {
    projects: (o?: string) => ['pentests', o] as const,
    scans: (projectId?: string) => ['pentest-scans', projectId] as const,
    scanFindings: (projectId?: string, scanId?: string | null) => ['pentest-scan-findings', projectId, scanId] as const,
    campaignPipeline: (projectId?: string) => ['campaign-pipeline', projectId] as const,
    analyze: (projectId?: string | null) => ['pentest-analyze', projectId] as const,
    scanApprovals: (o?: string, type?: string) => (type ? ['scan-approvals', o, type] as const : ['scan-approvals', o] as const),
    scanCredentials: (o?: string) => ['scan-credentials', o] as const,
    visualSimilarity: (o?: string) => ['visual-similarity', o] as const,
    suggestedTargets: (o?: string) => ['pentest-suggested-targets', o] as const,
    campaignExecutions: (o?: string) => ['campaign-executions', o] as const,
    runnerStatus: (o?: string | null) => ['runner-status', o] as const,
    campaignBudgetIncidents: (o?: string | null) => ['campaign-budget-incidents', o] as const,
    campaignBudgetPolicies: (o?: string | null) => ['campaign-budget-policies', o] as const,
  },

  warroomVerification: {
    runs: (o?: string | null) => ['warroom-verification-runs', o] as const,
    evidence: (o?: string | null, runId?: string | null) => ['warroom-verification-evidence', o, runId] as const,
  },

  footprint: {
    graph: (o?: string) => ['footprint-graph', o] as const,
    latestRun: (o?: string) => ['footprint-latest-run', o] as const,
    timeseries: (o?: string) => ['footprint-timeseries', o] as const,
    actionable: footprintActionable,
    narrative: footprintNarrative,
    delta: (o?: string) => ['footprint-delta', o] as const,
    postureDistribution: (o?: string) => ['posture-distribution', o] as const,
    postureHeadline: (o?: string) => ['posture-headline', o] as const,
    findingsOverlay: (o?: string) => ['findings-overlay', o] as const,
    candidatePaths: footprintCandidatePaths,
    breakthroughCandidates: boyAttackPathCandidates,
    breakthroughCandidateDetail: boyAttackPathCandidateDetail,
    breakthroughPaths: boyBreakthroughPaths,
    breakthroughPathDetail: boyBreakthroughPathDetail,
    researchFootprint,
    validationTasks: boyValidationTasks,
    surface: footprintSurface,
    surfaceEvidence: footprintSurfaceEvidence,
    companyScope: footprintCompanyScope,
    ruleOverrides: (o?: string) => ['footprint-rule-overrides', o] as const,
    threatSeed: (o?: string) => ['footprint-threat-seed', o] as const,
    path: (o?: string, entityId?: string) => ['footprint-path', o, entityId] as const,
  },

  threatIntel: {
    iocLookupAll: () => ['ioc-lookup'] as const,
    iocLookup: (o?: string, kind?: string, term?: string, scope?: string, page?: number) => ['ioc-lookup', o, kind, term, scope, page] as const,
    feedStatusAll: () => ['threat-intel-feed-status'] as const,
    feedStatus: (o?: string) => ['threat-intel-feed-status', o] as const,
    iocFeedStatusAll: () => ['ioc-feed-status'] as const,
    iocFeedStatus: (o?: string) => ['ioc-feed-status', o] as const,
    threatActorsAll: () => ['threat-actors'] as const,
    threatActors: (o?: string, term?: string, country?: string, page?: number) => ['threat-actors', o, term, country, page] as const,
    malwareFamiliesAll: () => ['malware-families'] as const,
    malwareFamilies: (o?: string, term?: string, familyType?: string, platform?: string, page?: number) => ['malware-families', o, term, familyType, platform, page] as const,
    ransomwareAll: () => ['ransomware'] as const,
    ransomware: (o?: string, term?: string, group?: string, country?: string, page?: number) => ['ransomware', o, term, group, country, page] as const,
    sensorMapAll: () => ['sensor-map'] as const,
    sensorMap: (o?: string) => ['sensor-map', o] as const,
    sensorObservationsAll: () => ['sensor-observations'] as const,
    sensorObservations: (o?: string, limit?: number, offset?: number) => ['sensor-observations', o, limit, offset] as const,
    iocManagerStatsAll: () => ['ioc-manager-stats'] as const,
    iocManagerStats: (o?: string) => ['ioc-manager-stats', o] as const,
    threatActorsManagerAll: () => ['threat-actors-manager'] as const,
    threatActorsManager: (o?: string) => ['threat-actors-manager', o] as const,
    malwareManagerAll: () => ['malware-manager'] as const,
    malwareManager: (o?: string) => ['malware-manager', o] as const,
    ransomwareManagerAll: () => ['ransomware-manager'] as const,
    ransomwareManager: (o?: string) => ['ransomware-manager', o] as const,
    eventScope: () => ['event-scope'] as const,
  },

  platform: {
    orgs: () => ['orgs'] as const,
    capabilities: (o?: string) => ['capabilities', o] as const,
    moduleRegistry: (o?: string) => (o ? ['module-registry', o] as const : ['module-registry'] as const),
    projectCapabilities: (o?: string, p?: string) => ['project-capabilities', o, p] as const,
    apiKeys: (o?: string) => ['api-keys', o] as const,
    ciPolicy: (o?: string) => ['ci-policy', o] as const,
    businessUnits: (o?: string) => ['business-units', o] as const,
    scanSchedules: (o?: string) => ['scanSchedules', o] as const,
    legacyScanSchedule: (o?: string) => ['scanSchedule', o] as const,
    systemScanners: () => ['system-scanners'] as const,
    scanLog: (o?: string) => ['scan-log', o] as const,
    schedulerConfigs: () => ['system-scheduler-configs'] as const,
    systemEventsPath: (basePath: string) => ['system-events', basePath] as const,
    systemEvents: (basePath: string, filter?: unknown) => ['system-events', basePath, filter] as const,
    systemEventsAggPath: (aggPath: string) => ['system-events-agg', aggPath] as const,
    systemEventsAgg: (aggPath: string, o?: string, category?: string) => ['system-events-agg', aggPath, o, category] as const,
    eventScope: () => ['event-scope'] as const,
    webhooks: (o?: string) => ['webhooks', o] as const,
    budgetPolicies: (o?: string) => ['budget-policies', o] as const,
    slaPolicies: (o?: string) => ['sla-policies', o] as const,
    runtimeEvents: (o?: string) => ['runtime-events', o] as const,
    rbacRoles: () => ['rbac-roles'] as const,
    rbacUserCapabilities: (o?: string, userId?: string) => ['rbac-user-capabilities', o, userId] as const,
    dataResidency: (o?: string) => ['system-data-residency', o] as const,
    legalHolds: (o?: string) => ['system-legal-holds', o] as const,
    cspmRules: () => ['system-cspm-rules'] as const,
    credentials: (status?: string) => ['system-credentials', status] as const,
    samlConfig: (o?: string) => ['saml-config', o] as const,
    scimTokens: (o?: string) => ['scim-tokens', o] as const,
    scimGroupMappings: (o?: string) => ['scim-group-mappings', o] as const,
    notificationChannels: () => ['system-notif-channels'] as const,
    notificationRules: () => ['system-notif-rules'] as const,
    orgNotificationChannels: (o?: string) => ['org-notif-channels', o] as const,
    orgNotificationRules: (o?: string) => ['org-notif-rules', o] as const,
    enterpriseProfile: () => ['system-enterprise-profile'] as const,
    enterpriseReadiness: (o?: string) => ['system-enterprise-readiness', o] as const,
    enterpriseAuditEvents: (o?: string, outcome?: string, limit?: number) => ['system-enterprise-audit-events', o, outcome ?? '', limit ?? 0] as const,
    launchpadPacks: (o?: string) => ['launchpad-packs', o] as const,
    launchpadPlan: (o?: string, packId?: string) => ['launchpad-plan', o, packId] as const,
    auditTrail: (workspaceId?: string) => ['audit-trail', workspaceId] as const,
    budgetGovernanceOverview: (workspaceId?: string) => ['budget-governance', 'overview', workspaceId] as const,
    budgetGovernancePolicies: (workspaceId?: string) => ['budget-governance', 'policies', workspaceId] as const,
  },

  dashboard: {
    leak: (o?: string) => ['dashboard-leak', o] as const,
    scoreEvents,
    scoreHistory,
  },

  cloud: {
    posture: (o?: string, page?: { limit?: number; after?: string }) => (
      page?.limit != null || page?.after
        ? ['cloud-posture', o, { limit: page.limit ?? null, after: page.after ?? null }] as const
        : ['cloud-posture', o] as const
    ),
    connectorStatus: (o?: string) => ['cloud-connectors-status', o] as const,
    cspmFindings: (o?: string) => ['cspm-findings', o] as const,
  },

  container: {
    posture: (o?: string) => ['container-posture', o] as const,
    findings: (o?: string) => ['container-findings', o] as const,
    runs: (o?: string) => ['container-scan-runs', o] as const,
    evidence: (o?: string, runId?: string) => ['container-scan-evidence', o, runId] as const,
    connections: (o?: string) => ['container-connections', o] as const,
  },

  // Integration health — IntegrationHealthBanner reads ['integration-health', orgId]
  // inline today; the 'integration.expired' SSE case invalidates the SAME literal
  // through this builder so the banner refreshes the moment probeGitHub flags an
  // expired/missing credential (M5).
  integrations: {
    health: (o?: string) => ['integration-health', o] as const,
  },

  organization: {
    chart: (o?: string) => ['org-chart', o] as const,
    managerCapabilities: (o?: string) => ['org-manager', 'caps', o] as const,
    managerRepos: (o?: string) => ['org-manager', 'repos', o] as const,
    managerMembers: (o?: string) => ['org-manager', 'members', o] as const,
    managerInvites: (o?: string) => ['org-manager', 'invites', o] as const,
  },

  identity: {
    membersNative: (o?: string) => ['org-members-native', o] as const,
    membersGitHub: (o?: string) => ['org-members', 'github', o] as const,
    membersGitLab: (groupPath?: string | null) => ['org-members', 'gitlab', groupPath] as const,
    posture: (o?: string) => ['identity-posture', o] as const,
    accessGraph: (o?: string) => ['identity-access-graph', o] as const,
  },

  mcp: {
    overview: (o?: string) => ['mcp-overview', o] as const,
    policy: (o?: string) => ['mcp-policy', o] as const,
    egress: (o?: string) => ['mcp-egress', o] as const,
    evidence: (o?: string) => ['mcp-evidence', o] as const,
    aiGovernanceScore: (o?: string) => ['ai-governance-score', o] as const,
    aiGovernanceUseCases: (o?: string) => ['ai-governance-use-cases', o] as const,
    aiGovernanceEvents: (o?: string) => ['ai-governance-events', o] as const,
    explanation: (o?: string, eventId?: string | null) => ['mcp-explanation', o, eventId] as const,
    eventExplanation: (o?: string, eventId?: string | null) => ['mcp-event-explanation', o, eventId] as const,
    sessionTimeline: (o?: string, sessionId?: string | null) => ['mcp-session-timeline', o, sessionId] as const,
  },

  reports: {
    templates: (o?: string) => ['report-templates', o] as const,
    components: (o?: string) => ['report-components', o] as const,
    sources: (o?: string) => ['report-sources', o] as const,
    dataSource: (sourceId?: string, o?: string) => ['report-ds', sourceId, o] as const,
    vaReportHtml: (o?: string, templateId?: string) => ['va-report-html', o, templateId] as const,
  },

  ops: {
    eventScope: () => ['ops-event-scope'] as const,
    slaBudget: (o?: string) => ['ops-sla-budget', o] as const,
    integrationsHealth: (o?: string) => ['ops-integrations-health', o] as const,
    credentialTest: (o?: string) => ['ops-cred-test', o] as const,
    wiringHealth: () => ['ops-wiring-health'] as const,
    scanFreshness: (o?: string) => ['ops-scan-freshness', o] as const,
  },

  explore: {
    stats: () => ['explore-stats'] as const,
    industries: () => ['explore-industries'] as const,
    coverage: () => ['explore-coverage'] as const,
    posture: (domain?: string) => ['explore-posture', domain] as const,
    industry: (industry?: string) => ['explore-industry', industry] as const,
  },

  history: {
    feed: (o?: string, since?: string, from?: string, to?: string, period?: string, kinds?: string, domain?: string, q?: string) =>
      ['history-feed', o, since, from, to, period, kinds, domain, q] as const,
    previousFeed: (o?: string, period?: string, kinds?: string, domain?: string, q?: string) =>
      ['history-feed-prev', o, period, kinds, domain, q] as const,
    auditManagerFeed: (o?: string, startISO?: string, endISO?: string) => ['audit-mgr', 'feed', o, startISO, endISO] as const,
    auditManagerPreviousFeed: (o?: string, startISO?: string, endISO?: string) =>
      ['audit-mgr', 'feed-prev', o, startISO, endISO] as const,
    pulseManagerFeed: (o?: string) => ['pulse-mgr', 'history-feed', o] as const,

    // ── Layered audit timeline + verdict homepage (Wave A) ──
    // Stable array prefixes, distinct from the feed/audit-mgr/pulse-mgr
    // literals above. `opts` is serialized into the key so distinct
    // windows/layers/subjects don't share a cache entry.
    timeline: (
      o?: string,
      opts?: {
        since?: string
        from?: string
        to?: string
        layers?: readonly string[]
        subjectId?: string
      },
    ) =>
      [
        'code-timeline',
        o,
        opts?.since ?? '',
        opts?.from ?? '',
        opts?.to ?? '',
        (opts?.layers ?? []).join(','),
        opts?.subjectId ?? '',
      ] as const,
    pathHistory: (o?: string, pathId?: string) => ['code-path-history', o, pathId] as const,
    confidence: (o?: string, fp?: string) => ['code-confidence-timeline', o, fp] as const,
    decision: (o?: string, fp?: string) => ['code-decision-timeline', o, fp] as const,
    verdict: (o?: string) => ['code-verdict-dashboard', o] as const,
    riskMatrix: (o?: string) => ['code-risk-matrix', o] as const,
  },

  fusion: {
    integrations: (o?: string) => ['fusion', 'integrations', o] as const,
    integrationHealth: (o?: string, integrationId?: string) => ['fusion', 'integration-health', o, integrationId] as const,
    unifiedPosture: (o?: string) => ['fusion', 'unified-posture', o] as const,
    resourcePosture: (o?: string, resourceId?: string) => ['fusion', 'resource-posture', o, resourceId] as const,
    reconciliationsOpen: (o?: string) => ['fusion', 'reconciliations', o, 'open'] as const,
    customMappings: (o?: string) => ['fusion', 'custom-mappings', o] as const,
    orgModules: (o?: string) => ['fusion', 'org-modules', o] as const,
  },

  scanning: {
    taintFlows: (o?: string) => ['org-taint-flows', o] as const,
    licenseIssues: (o?: string) => ['license-issues', o] as const,
    iacFindings: (o?: string) => ['iac-findings', o] as const,
    malwareResults: (o?: string) => ['malware-scan-results', o] as const,
  },

  settingsManager: {
    capabilities: (o?: string) => ['settings-manager', 'caps', o] as const,
    repos: (o?: string) => ['settings-manager', 'repos', o] as const,
    invites: (o?: string) => ['settings-manager', 'invites', o] as const,
    keys: (o?: string) => ['settings-manager', 'keys', o] as const,
    businessUnits: (o?: string) => ['settings-manager', 'bu', o] as const,
    credentials: (o?: string) => ['settings-manager', 'creds', o] as const,
    budgetPolicies: (o?: string) => ['settings-manager', 'budget', o] as const,
    budgetIncidents: (o?: string) => ['settings-manager', 'incidents', o] as const,
  },
} as const
