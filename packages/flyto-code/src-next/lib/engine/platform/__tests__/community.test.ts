import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestPublicCE } from '../../client'
import { getCEProductLoop } from '../community'

vi.mock('../../client', () => ({ requestPublicCE: vi.fn() }))

describe('community product loop client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the public deterministic CE product loop', async () => {
    vi.mocked(requestPublicCE).mockResolvedValueOnce({ edition: 'community' })

    await getCEProductLoop()

    expect(requestPublicCE).toHaveBeenCalledWith('/api/v1/ce/product-loop')
  })
})
