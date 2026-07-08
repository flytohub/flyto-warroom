import { beforeEach, describe, expect, it, vi } from 'vitest'

import { request, requestBlob } from '../../client'
import {
  downloadEnterpriseAuditExport,
  getEnterpriseProfile,
  getEnterpriseReadiness,
  listEnterpriseAuditEvents,
} from '../enterprise'

vi.mock('../../client', () => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enterprise control plane client', () => {
  it('reads the edition boundary profile', async () => {
    vi.mocked(request).mockResolvedValueOnce({ enterprise_enabled: true })

    await getEnterpriseProfile()

    expect(request).toHaveBeenCalledWith('GET', '/api/v1/system/enterprise/profile')
  })

  it('reads enterprise readiness for the selected org', async () => {
    vi.mocked(request).mockResolvedValueOnce({ domains: [] })

    await getEnterpriseReadiness('org-1')

    expect(request).toHaveBeenCalledWith('GET', '/api/v1/system/enterprise/readiness?org=org-1')
  })

  it('threads audit ledger filters through query params', async () => {
    vi.mocked(request).mockResolvedValueOnce({ events: [] })

    await listEnterpriseAuditEvents({
      org: 'org-1',
      actor_id: 'user:1',
      action: 'license.updated',
      surface: 'enterprise',
      outcome: 'denied',
      from: '2026-06-01T00:00:00Z',
      to: '2026-07-01T00:00:00Z',
      limit: 50,
    })

    expect(request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/system/enterprise/audit/events?org=org-1&actor_id=user%3A1&action=license.updated&surface=enterprise&outcome=denied&from=2026-06-01T00%3A00%3A00Z&to=2026-07-01T00%3A00%3A00Z&limit=50',
    )
  })

  it('downloads signed audit evidence in the selected format', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    vi.mocked(requestBlob).mockResolvedValueOnce(blob)

    const result = await downloadEnterpriseAuditExport({
      org: 'org-1',
      outcome: 'success',
      limit: 100,
      format: 'ndjson',
    })

    expect(result).toBe(blob)
    expect(requestBlob).toHaveBeenCalledWith(
      'GET',
      '/api/v1/system/enterprise/audit/export?org=org-1&outcome=success&limit=100&format=ndjson',
    )
  })
})
