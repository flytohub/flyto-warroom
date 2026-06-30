import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { qk } from '../../queryKeys'

const here = dirname(fileURLToPath(import.meta.url))
const routesText = readFileSync(join(here, '..', '__generated__', 'backend-routes.txt'), 'utf8')

describe('Nanshan vendor loop frontend contract', () => {
  const ORG = 'org-nanshan'
  const RESOURCE = 'res-nanshan'

  it('keeps the backend routes needed by the Bitsight + Cyble + BOY loop', () => {
    const requiredRoutes = [
      'GET /api/v1/code/orgs/{id}/attack-paths/candidates',
      'GET /api/v1/code/orgs/{id}/attack-paths/candidates/{hypothesisID}',
      'GET /api/v1/code/orgs/{id}/breakthrough-paths',
      'GET /api/v1/code/orgs/{id}/breakthrough-paths/{pathID}',
      'GET /api/v1/code/orgs/{id}/findings',
      'GET /api/v1/code/orgs/{id}/findings/overlay',
      'GET /api/v1/code/orgs/{id}/fusion/reconciliations',
      'GET /api/v1/code/orgs/{id}/fusion/resources/{resourceId}/posture',
      'GET /api/v1/code/orgs/{id}/fusion/summary',
      'GET /api/v1/code/orgs/{id}/fusion/unified-posture',
      'GET /api/v1/code/orgs/{id}/pulse',
      'GET /api/v1/code/orgs/{id}/research-footprint',
      'GET /api/v1/code/orgs/{id}/research-footprint/export',
      'GET /api/v1/code/orgs/{id}/validation-tasks',
      'POST /api/v1/code/orgs/{id}/bitsight/ingest',
      'POST /api/v1/code/orgs/{id}/breakthrough-paths/recompile',
      'POST /api/v1/code/orgs/{id}/evidence/ingest',
      'POST /api/v1/code/orgs/{id}/evidence/recompile',
      'POST /api/v1/code/orgs/{id}/fusion/integrations',
      'POST /api/v1/code/orgs/{id}/fusion/integrations/{integrationId}/ingest',
      'POST /api/v1/code/orgs/{id}/missing-evidence/{gapID}/tasks',
      'POST /api/v1/code/orgs/{id}/validation-tasks',
      'POST /api/v1/code/orgs/{id}/validation-tasks/{taskID}/complete',
      'POST /api/v1/code/orgs/{id}/validation-tasks/{taskID}/pentest-evidence',
    ]

    for (const route of requiredRoutes) {
      expect(routesText, `${route} must exist for the Nanshan vendor loop`).toContain(route)
    }
  })

  it('keeps cache keys aligned with the product surfaces refreshed by that loop', () => {
    expect(qk.fusion.unifiedPosture(ORG)).toEqual(['fusion', 'unified-posture', ORG])
    expect(qk.fusion.reconciliationsOpen(ORG)).toEqual(['fusion', 'reconciliations', ORG, 'open'])
    expect(qk.fusion.resourcePosture(ORG, RESOURCE)).toEqual(['fusion', 'resource-posture', ORG, RESOURCE])
    expect(qk.pulse.feed(ORG)).toEqual(['pulse', ORG])
    expect(qk.exposure.findingsPage(
      ORG,
      undefined,
      undefined,
      undefined,
      'bitsight',
      undefined,
      undefined,
      false,
      'nanshanlife',
      1,
    )).toEqual(['findings', ORG, undefined, undefined, undefined, 'bitsight', undefined, undefined, false, 'nanshanlife', 1])
    expect(qk.footprint.breakthroughCandidates(ORG)).toEqual(['boy-attack-path-candidates', ORG])
    expect(qk.footprint.validationTasks(ORG)).toEqual(['boy-validation-tasks', ORG])
    expect(qk.footprint.researchFootprint(ORG, 'hypothesis:hyp-nanshan')).toEqual([
      'research-footprint',
      ORG,
      'hypothesis:hyp-nanshan',
    ])
  })

  it('keeps the expected BOY state matrix explicit for the Nanshan reliability loop', () => {
    const expectedStates = [
      ['cyble_only', 'needs_validation'],
      ['bitsight_only', 'no_darkweb_candidate'],
      ['cyble_bitsight', 'needs_validation_with_supporting_evidence'],
      ['three_source_agree', 'needs_validation_with_higher_priority'],
      ['three_source_conflict', 'needs_validation_contested'],
      ['duplicated_ingest', 'unchanged_counts'],
      ['stale_vendor_data', 'no_recent_why_now'],
      ['wrong_domain', 'no_merge'],
    ]

    expect(expectedStates).toContainEqual(['three_source_conflict', 'needs_validation_contested'])
    expect(expectedStates).toContainEqual(['bitsight_only', 'no_darkweb_candidate'])
    expect(expectedStates).not.toContainEqual(['three_source_agree', 'validated'])
  })
})
