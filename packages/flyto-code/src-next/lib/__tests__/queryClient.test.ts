import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../queryClient'

function emitMutationError(error: Error, mutation?: unknown) {
  const cache = queryClient.getMutationCache() as unknown as {
    config: {
      onError?: (error: Error, variables: unknown, context: unknown, mutation?: unknown) => void
    }
  }

  cache.config.onError?.(error, undefined, undefined, mutation)
}

describe('queryClient mutation errors', () => {
  afterEach(() => {
    queryClient.clear()
    vi.restoreAllMocks()
  })

  it('surfaces default mutation errors without mutation metadata', () => {
    const details: string[] = []
    const listener = (event: Event) => {
      details.push((event as CustomEvent<string>).detail)
    }
    window.addEventListener('flyto:mutation-error', listener)

    try {
      expect(() => emitMutationError(new Error('Failed to fetch'))).not.toThrow()
    } finally {
      window.removeEventListener('flyto:mutation-error', listener)
    }

    expect(details).toEqual(['Failed to fetch'])
  })

  it('lets local mutation onError handle domain-specific failures', () => {
    const listener = vi.fn()
    window.addEventListener('flyto:mutation-error', listener)

    try {
      emitMutationError(new Error('Handled locally'), { options: { onError: vi.fn() } })
    } finally {
      window.removeEventListener('flyto:mutation-error', listener)
    }

    expect(listener).not.toHaveBeenCalled()
  })
})
