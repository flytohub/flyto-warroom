import '../../../test/i18nTestSetup'
import { describe, expect, it } from 'vitest'
import { autofixStatusCopy, autofixStatusReason } from '../statusReason'

const row = (patch_status: string, patch_status_reason?: string, patch_status_message?: string) =>
  ({ patch_status, patch_status_reason, patch_status_message } as Parameters<typeof autofixStatusCopy>[0])

describe('autofix status reason copy', () => {
  it('falls back from patch_status when old rows have no reason', () => {
    expect(autofixStatusReason(row('outdated'))).toBe('finding_resolved')
    expect(autofixStatusReason(row('permanently_no_preview'))).toBe('retry_cap')
  })

  it('uses persisted clone_failed reason instead of generic no diff copy', () => {
    const copy = autofixStatusCopy(row('no_preview', 'clone_failed'))
    expect(copy.tone).toBe('error')
    expect(copy.title).toContain('clone')
    expect(copy.label).toBe('Repo access')
  })

  it('treats resolved findings as successful noise reduction, not stale failure', () => {
    const copy = autofixStatusCopy(row('outdated', 'finding_resolved'))
    expect(copy.tone).toBe('success')
    expect(copy.label).toBe('Resolved')
  })

  it('uses localized body for known backend reasons even when backend sends English copy', () => {
    const copy = autofixStatusCopy(row('no_preview', 'cached_no_change', 'cached from server'))
    expect(copy.body).not.toBe('cached from server')
    expect(copy.body).toContain('file has not changed')
    expect(copy.tone).toBe('info')
  })

  it('preserves backend message for unknown future reasons', () => {
    const copy = autofixStatusCopy(row('no_preview', 'custom_reason', 'custom backend detail'))
    expect(copy.body).toBe('custom backend detail')
  })
})
