import { describe, expect, it, vi, beforeEach } from 'vitest'

import { request } from '../../client'
import { getAssetCoverage, getAssetCoverageResource } from '../assetCoverage'

vi.mock('../../client', () => ({
  request: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('asset coverage client', () => {
  it('reads the org coverage ledger', async () => {
    vi.mocked(request).mockResolvedValueOnce({ orgId: 'org-1' })

    await getAssetCoverage('org-1')

    expect(request).toHaveBeenCalledWith('GET', '/api/v1/code/orgs/org-1/asset-coverage')
  })

  it('threads coverage filters through query params', async () => {
    vi.mocked(request).mockResolvedValueOnce({ orgId: 'org-1' })

    await getAssetCoverage('org-1', {
      category: 'domain',
      resourceId: 'res:1',
      entityId: 'ent:1',
      includeScope: false,
    })

    expect(request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/code/orgs/org-1/asset-coverage?category=domain&resourceId=res%3A1&entityId=ent%3A1&includeScope=false',
    )
  })

  it('encodes resource detail paths', async () => {
    vi.mocked(request).mockResolvedValueOnce({ orgId: 'org-1' })

    await getAssetCoverageResource('org-1', 'res:domain/example.com')

    expect(request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/code/orgs/org-1/asset-coverage/resources/res%3Adomain%2Fexample.com',
    )
  })
})
