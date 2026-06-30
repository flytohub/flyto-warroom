import type { QueryClient } from '@tanstack/react-query'

import { qk } from './queryKeys'

type Invalidator = Pick<QueryClient, 'invalidateQueries'>

export function invalidateFootprintProgress(qc: Invalidator, orgId: string): void {
  const keys = [
    qk.footprint.latestRun(orgId),
    qk.footprint.graph(orgId),
    qk.footprint.timeseries(orgId),
    qk.footprint.actionable(orgId),
  ]
  for (const queryKey of keys) {
    qc.invalidateQueries({ queryKey })
  }
}

export function invalidateFootprintClosure(qc: Invalidator, orgId: string): void {
  invalidateFootprintProgress(qc, orgId)

  const keys = [
    qk.footprint.narrative(orgId),
    qk.footprint.delta(orgId),
    qk.footprint.postureDistribution(orgId),
    qk.footprint.postureHeadline(orgId),
    qk.footprint.findingsOverlay(orgId),
    qk.footprint.candidatePaths(orgId),
    qk.footprint.breakthroughCandidates(orgId),
    qk.footprint.breakthroughCandidateDetail(orgId),
    qk.footprint.breakthroughPaths(orgId),
    qk.footprint.breakthroughPathDetail(orgId),
    qk.footprint.researchFootprint(orgId),
    qk.footprint.validationTasks(orgId),
    qk.footprint.surface(orgId),
    qk.footprint.surfaceEvidence(orgId),
    qk.footprint.companyScope(orgId),
    qk.footprint.threatSeed(orgId),
    qk.domains.assetEvidence(orgId),
    qk.pentest.suggestedTargets(orgId),
    qk.attackSurface(orgId),
    qk.externalPosture(orgId),
    qk.externalPostureKernel(orgId),
    qk.externalIssues(orgId),
    qk.assetMapKernel(orgId),
    qk.exposure.assetCoverage(orgId),
    qk.exposure.brandProtection(orgId),
    qk.exposure.brandManagerVisualSimilarity(orgId),
    qk.ctem.priorities(orgId),
    qk.pentest.visualSimilarity(orgId),
    qk.exposure.discoveryRuns(orgId),
  ]
  for (const queryKey of keys) {
    qc.invalidateQueries({ queryKey })
  }
}
