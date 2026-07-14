import { describe, it, expect } from 'vitest'
import { qk } from '../queryKeys'

// These tests lock the LITERAL shape of every key so a future
// rename ripples to call sites + invalidation sites together (or
// the test fails first, which is the point). The string values are
// also the cache keys React Query uses for matching; changing one
// here is a wire-level break — keep the strings stable across
// migrations even if the builder name changes.
describe('queryKeys factory', () => {
  const ORG = 'org-1'

  it('builds attack-surface key', () => {
    expect(qk.attackSurface(ORG)).toEqual(['attack-surface', 'org-1'])
  })

  it('builds external-posture key', () => {
    expect(qk.externalPosture(ORG)).toEqual(['external-posture', 'org-1'])
  })

  it('builds external-posture-kernel key', () => {
    expect(qk.externalPostureKernel(ORG)).toEqual(['external-posture-kernel', 'org-1'])
  })

  it('builds external-issues key', () => {
    expect(qk.externalIssues(ORG)).toEqual(['external-issues', 'org-1'])
  })

  it('builds asset-map-kernel key', () => {
    expect(qk.assetMapKernel(ORG)).toEqual(['asset-map-kernel', 'org-1'])
    expect(qk.assetMapKernelMode(ORG, 'leads')).toEqual(['asset-map-kernel', 'org-1', 'leads'])
  })

  it('builds computed-score key', () => {
    expect(qk.computedScore(ORG)).toEqual(['computed-score', 'org-1'])
  })

  it('builds unified score history keys with broad and scoped forms', () => {
    expect(qk.scoring.scoreHistory(ORG)).toEqual(['unified-score-history', 'org-1'])
    expect(qk.scoring.scoreHistory(ORG, 90)).toEqual(['unified-score-history', 'org-1', 90])
  })

  it('builds score-event keys with broad and day-scoped forms', () => {
    expect(qk.scoring.scoreEvents(ORG)).toEqual(['score-events', 'org-1'])
    expect(qk.scoring.scoreEvents(ORG, 30)).toEqual(['score-events', 'org-1', '30'])
    expect(qk.dashboard.scoreEvents(ORG, 30)).toEqual(['score-events', 'org-1', '30'])
  })

  it('builds CTEM priorities keys with broad and scoped forms', () => {
    expect(qk.ctem.priorities(ORG)).toEqual(['ctem-priorities', 'org-1'])
    expect(qk.ctem.priorities(ORG, 'dedup')).toEqual(['ctem-priorities', 'org-1', 'dedup'])
  })

  it('builds governance/settings keys', () => {
    expect(qk.platform.rbacRoles()).toEqual(['rbac-roles'])
    expect(qk.platform.rbacUserCapabilities(ORG, 'user-1')).toEqual(['rbac-user-capabilities', 'org-1', 'user-1'])
    expect(qk.platform.dataResidency(ORG)).toEqual(['system-data-residency', 'org-1'])
    expect(qk.platform.legalHolds(ORG)).toEqual(['system-legal-holds', 'org-1'])
    expect(qk.platform.orgs()).toEqual(['orgs'])
    expect(qk.platform.apiKeys(ORG)).toEqual(['api-keys', 'org-1'])
    expect(qk.platform.runtimeEvents(ORG)).toEqual(['runtime-events', 'org-1'])
    expect(qk.platform.systemEventsPath('/api/v1/system/events')).toEqual(['system-events', '/api/v1/system/events'])
    expect(qk.platform.systemEventsAggPath('/api/v1/system/events/aggregates')).toEqual([
      'system-events-agg',
      '/api/v1/system/events/aggregates',
    ])
  })

  it('builds repo and pentest keys used by cross-page invalidation', () => {
    expect(qk.repos.connected(ORG)).toEqual(['repos', 'org-1'])
    expect(qk.repos.connectedAll()).toEqual(['repos'])
    expect(qk.repos.healthSummary(ORG)).toEqual(['healthSummary', 'org-1'])
    expect(qk.repos.scansAll()).toEqual(['repo-scans'])
    expect(qk.repos.scanResults('scan-1')).toEqual(['scan-results', 'scan-1'])
    expect(qk.repos.apiDefinitions(ORG)).toEqual(['api-definitions', 'org-1'])
    expect(qk.repos.archMap(ORG)).toEqual(['arch-map', 'org-1'])
    expect(qk.repos.scanDiff(ORG)).toEqual(['org-scan-diff', 'org-1'])
    expect(qk.repos.deadCode(ORG)).toEqual(['org-dead-code', 'org-1'])
    expect(qk.repos.dependencies(ORG)).toEqual(['org-dependencies', 'org-1'])
    expect(qk.repos.githubOrgs(ORG)).toEqual(['github-orgs', 'org-1'])
    expect(qk.repos.githubOrgMembers(ORG, 'octo')).toEqual(['github-org-members', 'org-1', 'octo'])
    expect(qk.pentest.projects(ORG)).toEqual(['pentests', 'org-1'])
    expect(qk.pentest.suggestedTargets(ORG)).toEqual(['pentest-suggested-targets', 'org-1'])
    expect(qk.pentest.scans('pt-1')).toEqual(['pentest-scans', 'pt-1'])
    expect(qk.pentest.campaignPipeline('pt-1')).toEqual(['campaign-pipeline', 'pt-1'])
    expect(qk.pentest.analyze('pt-1')).toEqual(['pentest-analyze', 'pt-1'])
  })

  it('builds Footprint actionable keys with broad, tier, and refresh forms', () => {
    expect(qk.footprint.actionable(ORG)).toEqual(['footprint-actionable', 'org-1'])
    expect(qk.footprint.actionable(ORG, 'any')).toEqual(['footprint-actionable', 'org-1', 'any'])
    expect(qk.footprint.actionable(ORG, 'any', 200)).toEqual(['footprint-actionable', 'org-1', 'any', 200])
  })

  it('builds Footprint narrative keys with broad and refresh forms', () => {
    expect(qk.footprint.narrative(ORG)).toEqual(['footprint-narrative', 'org-1'])
    expect(qk.footprint.narrative(ORG, 7)).toEqual(['footprint-narrative', 'org-1', 7])
  })

  it('builds Footprint closure keys with broad and scoped forms', () => {
    expect(qk.footprint.candidatePaths(ORG)).toEqual(['footprint-candidate-paths', 'org-1'])
    expect(qk.footprint.candidatePaths(ORG, 50)).toEqual(['footprint-candidate-paths', 'org-1', 50])
    expect(qk.footprint.breakthroughCandidates(ORG)).toEqual(['boy-attack-path-candidates', 'org-1'])
    expect(qk.footprint.breakthroughCandidates(ORG, 100)).toEqual(['boy-attack-path-candidates', 'org-1', 100])
    expect(qk.footprint.breakthroughCandidateDetail(ORG)).toEqual(['boy-attack-path-candidate-detail', 'org-1'])
    expect(qk.footprint.breakthroughCandidateDetail(ORG, 'hyp-1')).toEqual(['boy-attack-path-candidate-detail', 'org-1', 'hyp-1'])
    expect(qk.footprint.breakthroughPaths(ORG)).toEqual(['boy-breakthrough-paths', 'org-1'])
    expect(qk.footprint.breakthroughPaths(ORG, 100)).toEqual(['boy-breakthrough-paths', 'org-1', 100])
    expect(qk.footprint.breakthroughPathDetail(ORG)).toEqual(['boy-breakthrough-path-detail', 'org-1'])
    expect(qk.footprint.breakthroughPathDetail(ORG, 'path-1')).toEqual(['boy-breakthrough-path-detail', 'org-1', 'path-1'])
    expect(qk.footprint.researchFootprint(ORG)).toEqual(['research-footprint', 'org-1'])
    expect(qk.footprint.researchFootprint(ORG, 'path:path-1')).toEqual(['research-footprint', 'org-1', 'path:path-1'])
    expect(qk.footprint.validationTasks(ORG)).toEqual(['boy-validation-tasks', 'org-1'])
    expect(qk.footprint.validationTasks(ORG, 100)).toEqual(['boy-validation-tasks', 'org-1', 100])
    expect(qk.footprint.surface(ORG)).toEqual(['footprint-surface', 'org-1'])
    expect(qk.footprint.surface(ORG, 'noise')).toEqual(['footprint-surface', 'org-1', 'noise'])
    expect(qk.footprint.surfaceEvidence(ORG)).toEqual(['footprint-surface-evidence', 'org-1'])
    expect(qk.footprint.surfaceEvidence(ORG, 'res-1')).toEqual(['footprint-surface-evidence', 'org-1', 'res-1'])
    expect(qk.footprint.companyScope(ORG)).toEqual(['footprint-company-scope', 'org-1'])
  })

  it('builds domain evidence keys with broad and scoped forms', () => {
    expect(qk.domains.assetEvidence(ORG)).toEqual(['asset-evidence', 'org-1'])
    expect(qk.domains.assetEvidence(ORG, 'subdomain')).toEqual(['asset-evidence', 'org-1', 'subdomain'])
    expect(qk.domains.assetEvidence(ORG, 'subdomain', 'api.example.com')).toEqual([
      'asset-evidence',
      'org-1',
      'subdomain',
      'api.example.com',
    ])
  })

  it('builds runtime and report keys for operations/admin closure', () => {
    expect(qk.mcp.overview(ORG)).toEqual(['mcp-overview', 'org-1'])
    expect(qk.mcp.policy(ORG)).toEqual(['mcp-policy', 'org-1'])
    expect(qk.mcp.egress(ORG)).toEqual(['mcp-egress', 'org-1'])
    expect(qk.mcp.evidence(ORG)).toEqual(['mcp-evidence', 'org-1'])
    expect(qk.mcp.aiGovernanceScore(ORG)).toEqual(['ai-governance-score', 'org-1'])
    expect(qk.mcp.aiGovernanceUseCases(ORG)).toEqual(['ai-governance-use-cases', 'org-1'])
    expect(qk.mcp.aiGovernanceEvents(ORG)).toEqual(['ai-governance-events', 'org-1'])
    expect(qk.mcp.attackLabSimulation(ORG, 'enforce')).toEqual(['mcp-attack-lab-simulate', 'org-1', 'enforce'])
    expect(qk.cloud.posture(ORG)).toEqual(['cloud-posture', 'org-1'])
    expect(qk.cloud.posture(ORG, { limit: 500 })).toEqual([
      'cloud-posture',
      'org-1',
      { limit: 500, after: null },
    ])
    expect(qk.cloud.posture(ORG, { limit: 500, after: 'cursor-1' })).toEqual([
      'cloud-posture',
      'org-1',
      { limit: 500, after: 'cursor-1' },
    ])
    expect(qk.container.posture(ORG)).toEqual(['container-posture', 'org-1'])
    expect(qk.container.findings(ORG)).toEqual(['container-findings', 'org-1'])
    expect(qk.container.runs(ORG)).toEqual(['container-scan-runs', 'org-1'])
    expect(qk.container.evidence(ORG, 'run-1')).toEqual(['container-scan-evidence', 'org-1', 'run-1'])
    expect(qk.container.connections(ORG)).toEqual(['container-connections', 'org-1'])
    expect(qk.identity.posture(ORG)).toEqual(['identity-posture', 'org-1'])
    expect(qk.identity.accessGraph(ORG)).toEqual(['identity-access-graph', 'org-1'])
    expect(qk.integrations.health(ORG)).toEqual(['integration-health', 'org-1'])
    expect(qk.reports.templates(ORG)).toEqual(['report-templates', 'org-1'])
    expect(qk.reports.vaReportHtml(ORG, 'tpl-1')).toEqual(['va-report-html', 'org-1', 'tpl-1'])
  })

  it('builds closed-loop manager and drawer keys', () => {
    expect(qk.security.workflowExecutionAll()).toEqual(['workflow-execution'])
    expect(qk.security.repoVerifyExecutions('repo-1')).toEqual(['repo-verify-exec', 'repo-1'])
    expect(qk.security.verifyHistory('repo-1', 'CVE-1', 'pkg')).toEqual(['verify-history', 'repo-1', 'CVE-1', 'pkg'])
    expect(qk.security.alertBlastGraph('alert-1')).toEqual(['alert-blast-graph', 'alert-1'])
    expect(qk.security.alertBlastGraphAll()).toEqual(['alert-blast-graph'])
    expect(qk.security.alerts(ORG)).toEqual(['alerts', 'org-1'])
    expect(qk.security.alerts(ORG, 'resolved')).toEqual(['alerts', 'org-1', 'resolved'])
    expect(qk.security.enrichedAlerts(ORG)).toEqual(['alerts', 'org-1', 'enriched'])
    expect(qk.security.unifiedFindingAll(ORG)).toEqual(['unified-finding', 'org-1'])
    expect(qk.autofix.aiProposals('repo-1')).toEqual(['ai-proposals', 'repo-1'])
    expect(qk.autofix.aiFixContext('repo-1')).toEqual(['ai-fix-context', 'repo-1'])
    expect(qk.exposure.findingsPage(ORG, 'high', 'bad', 'critical', 'ctem', 'tls', true, false, 'api', 2)).toEqual([
      'findings',
      'org-1',
      'high',
      'bad',
      'critical',
      'ctem',
      'tls',
      true,
      false,
      'api',
      2,
    ])
    expect(qk.exposure.findingsManagerFacets(ORG)).toEqual(['findings-facets', 'org-1', 'manager'])
    expect(qk.exposure.findingsManagerRollup(ORG)).toEqual(['findings', 'org-1', 'manager-rollup'])
    expect(qk.exposure.findingsManagerHistory(ORG)).toEqual(['findings', 'org-1', 'manager-history'])
    expect(qk.exposure.assetCoverage(ORG)).toEqual(['asset-coverage', 'org-1'])
    expect(qk.exposure.brandManagerAttackSurface(ORG)).toEqual(['brand-manager-attack-surface', 'org-1'])
    expect(qk.exposure.brandManagerVisualSimilarity(ORG)).toEqual(['brand-manager-visual-sim', 'org-1'])
    expect(qk.exposure.brandProtection(ORG)).toEqual(['brand-protection', 'org-1'])
    expect(qk.exposure.brandProtectionCampaigns(ORG)).toEqual(['brand-protection-campaigns', 'org-1'])
  })

  it('builds operations, platform, organization, and settings manager keys', () => {
    expect(qk.ops.eventScope()).toEqual(['ops-event-scope'])
    expect(qk.ops.slaBudget(ORG)).toEqual(['ops-sla-budget', 'org-1'])
    expect(qk.ops.integrationsHealth(ORG)).toEqual(['ops-integrations-health', 'org-1'])
    expect(qk.ops.credentialTest(ORG)).toEqual(['ops-cred-test', 'org-1'])
    expect(qk.ops.wiringHealth()).toEqual(['ops-wiring-health'])
    expect(qk.ops.scanFreshness(ORG)).toEqual(['ops-scan-freshness', 'org-1'])
    expect(qk.platform.schedulerConfigs()).toEqual(['system-scheduler-configs'])
    expect(qk.platform.legacyScanSchedule(ORG)).toEqual(['scanSchedule', 'org-1'])
    expect(qk.platform.samlConfig(ORG)).toEqual(['saml-config', 'org-1'])
    expect(qk.platform.scimTokens(ORG)).toEqual(['scim-tokens', 'org-1'])
    expect(qk.platform.scimGroupMappings(ORG)).toEqual(['scim-group-mappings', 'org-1'])
    expect(qk.platform.notificationChannels()).toEqual(['system-notif-channels'])
    expect(qk.platform.notificationRules()).toEqual(['system-notif-rules'])
    expect(qk.platform.auditTrail(ORG)).toEqual(['audit-trail', 'org-1'])
    expect(qk.platform.budgetGovernanceOverview(ORG)).toEqual(['budget-governance', 'overview', 'org-1'])
    expect(qk.platform.budgetGovernancePolicies(ORG)).toEqual(['budget-governance', 'policies', 'org-1'])
    expect(qk.organization.managerCapabilities(ORG)).toEqual(['org-manager', 'caps', 'org-1'])
    expect(qk.settingsManager.credentials(ORG)).toEqual(['settings-manager', 'creds', 'org-1'])
  })

  it('builds explore, history, fusion, and scanning keys', () => {
    expect(qk.explore.stats()).toEqual(['explore-stats'])
    expect(qk.explore.posture('example.com')).toEqual(['explore-posture', 'example.com'])
    expect(qk.history.auditManagerFeed(ORG, 'a', 'b')).toEqual(['audit-mgr', 'feed', 'org-1', 'a', 'b'])
    expect(qk.history.feed(ORG, '7d', '', '', '', 'scan', 'example.com', 'tls')).toEqual([
      'history-feed',
      'org-1',
      '7d',
      '',
      '',
      '',
      'scan',
      'example.com',
      'tls',
    ])
    expect(qk.fusion.integrations(ORG)).toEqual(['fusion', 'integrations', 'org-1'])
    expect(qk.fusion.resourcePosture(ORG, 'res-1')).toEqual(['fusion', 'resource-posture', 'org-1', 'res-1'])
    expect(qk.fusion.reconciliationsOpen(ORG)).toEqual(['fusion', 'reconciliations', 'org-1', 'open'])
    expect(qk.scanning.taintFlows(ORG)).toEqual(['org-taint-flows', 'org-1'])
    expect(qk.scanning.licenseIssues(ORG)).toEqual(['license-issues', 'org-1'])
    expect(qk.scanning.iacFindings(ORG)).toEqual(['iac-findings', 'org-1'])
    expect(qk.scanning.malwareResults(ORG)).toEqual(['malware-scan-results', 'org-1'])
  })

  it('builds threat intel root keys for broad refresh invalidation', () => {
    expect(qk.threatIntel.threatActorsAll()).toEqual(['threat-actors'])
    expect(qk.threatIntel.malwareFamiliesAll()).toEqual(['malware-families'])
    expect(qk.threatIntel.ransomwareAll()).toEqual(['ransomware'])
    expect(qk.threatIntel.iocLookupAll()).toEqual(['ioc-lookup'])
    expect(qk.threatIntel.sensorMapAll()).toEqual(['sensor-map'])
    expect(qk.threatIntel.sensorObservationsAll()).toEqual(['sensor-observations'])
    expect(qk.threatIntel.sensorObservations(ORG, 6, 0)).toEqual(['sensor-observations', 'org-1', 6, 0])
    expect(qk.threatIntel.feedStatusAll()).toEqual(['threat-intel-feed-status'])
    expect(qk.threatIntel.iocFeedStatusAll()).toEqual(['ioc-feed-status'])
    expect(qk.threatIntel.iocManagerStatsAll()).toEqual(['ioc-manager-stats'])
    expect(qk.threatIntel.iocManagerStats(ORG)).toEqual(['ioc-manager-stats', 'org-1'])
    expect(qk.threatIntel.threatActorsManagerAll()).toEqual(['threat-actors-manager'])
    expect(qk.threatIntel.threatActorsManager(ORG)).toEqual(['threat-actors-manager', 'org-1'])
    expect(qk.threatIntel.malwareManagerAll()).toEqual(['malware-manager'])
    expect(qk.threatIntel.malwareManager(ORG)).toEqual(['malware-manager', 'org-1'])
    expect(qk.threatIntel.ransomwareManagerAll()).toEqual(['ransomware-manager'])
    expect(qk.threatIntel.ransomwareManager(ORG)).toEqual(['ransomware-manager', 'org-1'])
  })

  it('passes undefined orgId through (useQuery `enabled` gate handles the off case)', () => {
    expect(qk.attackSurface(undefined)).toEqual(['attack-surface', undefined])
  })
})
