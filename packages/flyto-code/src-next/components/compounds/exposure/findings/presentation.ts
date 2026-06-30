import { t } from '@lib/i18n';
import type { Finding } from '@lib/engine'

export type FindingChipColor = 'default' | 'error' | 'warning' | 'success' | 'info'

export interface FindingChipMeta {
  label: string
  color: FindingChipColor
  variant: 'filled' | 'outlined'
}

export function findingStatusMeta(f: Finding): FindingChipMeta {
  switch (f.lifecycle_summary?.status) {
    case 'historical_resolved':
      return { label: t('findings.historical'), color: 'success', variant: 'outlined' }
    case 'current_good':
      return { label: t('findings.currentGood'), color: 'success', variant: 'outlined' }
    case 'pending_verify':
      return { label: t('findings.pendingVerify'), color: 'warning', variant: 'filled' }
    case 'verified_fixed':
      return { label: t('findings.verifiedFixed'), color: 'success', variant: 'filled' }
    case 'reopened':
      return { label: t('findings.reopened'), color: 'error', variant: 'filled' }
    case 'current_bad':
      return { label: t('findings.openIssue'), color: 'error', variant: 'outlined' }
  }
  if (f.resolved_at) {
    return { label: t('findings.resolved'), color: 'success', variant: 'filled' }
  }
  if (f.verification_state === 'pending_verify') {
    return { label: t('findings.pendingVerify'), color: 'warning', variant: 'filled' }
  }
  if (f.verification_state === 'reopened') {
    return { label: t('findings.reopened'), color: 'error', variant: 'filled' }
  }
  if (f.verification_state === 'verified_fixed') {
    return { label: t('findings.verifiedFixed'), color: 'success', variant: 'filled' }
  }
  return { label: t('findings.open'), color: 'error', variant: 'outlined' }
}

export function sourceQualityMeta(status?: string): FindingChipMeta {
  switch (status) {
    case 'confirmed':
      return { label: t('findings.sourceConfirmed'), color: 'success', variant: 'filled' }
    case 'corroborated':
      return { label: t('findings.sourceCorroborated'), color: 'info', variant: 'filled' }
    case 'candidate':
      return { label: t('findings.sourceCandidate'), color: 'warning', variant: 'outlined' }
    case 'conflict':
      return { label: t('findings.sourceConflict'), color: 'error', variant: 'filled' }
    case 'not_collected':
      return { label: t('findings.sourceNotCollected'), color: 'default', variant: 'outlined' }
    default:
      return { label: t('findings.sourceUnknown'), color: 'default', variant: 'outlined' }
  }
}
