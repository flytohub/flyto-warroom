import { t } from '@lib/i18n';
import type { AutofixFindingRow } from '@lib/engine'

export type AutofixStatusTone = 'info' | 'warning' | 'error' | 'success'

export interface AutofixStatusCopy {
  title: string
  body: string
  tone: AutofixStatusTone
  label: string
  actionLabel: string
}

type ReasonInput = Pick<AutofixFindingRow,
  'patch_status' | 'patch_status_reason' | 'patch_status_message'>

export function autofixStatusReason(row: ReasonInput): string {
  if (row.patch_status_reason) return row.patch_status_reason
  switch (row.patch_status) {
    case 'preview': return 'patch_ready'
    case 'pr_opened': return 'pr_opened'
    case 'outdated': return 'finding_resolved'
    case 'permanently_no_preview': return 'retry_cap'
    default: return 'not_generated'
  }
}
export function autofixStatusCopy(row: ReasonInput): AutofixStatusCopy {
  const reason = autofixStatusReason(row)
  const body = isKnownStatusReason(reason)
    ? defaultBody(reason)
    : row.patch_status_message || defaultBody(reason)
  switch (reason) {
    case 'patch_ready':
      return {
        title: t('autofix.status.patchReady.title'),
        body,
        tone: 'success',
        label: t('autofix.status.patchReady.label'),
        actionLabel: t('autofix.actionRegenerate'),
      }
    case 'pr_opened':
      return {
        title: t('autofix.status.prOpened.title'),
        body,
        tone: 'success',
        label: t('autofix.status.prOpened.label'),
        actionLabel: t('autofix.actionViewPreview'),
      }
    case 'cached_no_change':
      return {
        title: t('autofix.status.cachedNoChange.title'),
        body,
        tone: 'info',
        label: t('autofix.status.cachedNoChange.label'),
        actionLabel: t('autofix.retryNow'),
      }
    case 'finding_resolved':
      return {
        title: t('autofix.status.findingResolved.title'),
        body,
        tone: 'success',
        label: t('autofix.status.findingResolved.label'),
        actionLabel: t('autofix.actionRegenerate'),
      }
    case 'clone_failed':
      return {
        title: t('autofix.status.cloneFailed.title'),
        body,
        tone: 'error',
        label: t('autofix.status.cloneFailed.label'),
        actionLabel: t('autofix.retryNow'),
      }
    case 'detect_failed':
      return {
        title: t('autofix.status.detectFailed.title'),
        body,
        tone: 'error',
        label: t('autofix.status.detectFailed.label'),
        actionLabel: t('autofix.retryNow'),
      }
    case 'transform_failed':
      return {
        title: t('autofix.status.transformFailed.title'),
        body,
        tone: 'error',
        label: t('autofix.status.transformFailed.label'),
        actionLabel: t('autofix.retryNow'),
      }
    case 'rule_unavailable':
      return {
        title: t('autofix.status.ruleUnavailable.title'),
        body,
        tone: 'error',
        label: t('autofix.status.ruleUnavailable.label'),
        actionLabel: t('autofix.actionRegenerate'),
      }
    case 'ambiguous_match':
      return {
        title: t('autofix.status.ambiguousMatch.title'),
        body,
        tone: 'warning',
        label: t('autofix.status.ambiguousMatch.label'),
        actionLabel: t('autofix.retryNow'),
      }
    case 'retry_cap':
      return {
        title: t('autofix.status.retryCap.title'),
        body,
        tone: 'error',
        label: t('autofix.status.retryCap.label'),
        actionLabel: t('autofix.forceRetry'),
      }
    case 'empty_patch':
      return {
        title: t('autofix.status.emptyPatch.title'),
        body,
        tone: 'warning',
        label: t('autofix.status.emptyPatch.label'),
        actionLabel: t('autofix.retryNow'),
      }
    default:
      return {
        title: t('autofix.status.notGenerated.title'),
        body,
        tone: 'info',
        label: t('autofix.status.notGenerated.label'),
        actionLabel: t('autofix.actionCreatePreview'),
      }
  }
}

function isKnownStatusReason(reason: string): boolean {
  switch (reason) {
    case 'patch_ready':
    case 'pr_opened':
    case 'cached_no_change':
    case 'finding_resolved':
    case 'clone_failed':
    case 'detect_failed':
    case 'transform_failed':
    case 'rule_unavailable':
    case 'ambiguous_match':
    case 'retry_cap':
    case 'empty_patch':
    case 'not_generated':
      return true
    default:
      return false
  }
}

function defaultBody(reason: string): string {
  switch (reason) {
    case 'patch_ready':
      return t('autofix.status.patchReady.body')
    case 'pr_opened':
      return t('autofix.status.prOpened.body')
    case 'cached_no_change':
      return t('autofix.status.cachedNoChange.body')
    case 'finding_resolved':
      return t('autofix.status.findingResolved.body')
    case 'clone_failed':
      return t('autofix.status.cloneFailed.body')
    case 'detect_failed':
      return t('autofix.status.detectFailed.body')
    case 'transform_failed':
      return t('autofix.status.transformFailed.body')
    case 'rule_unavailable':
      return t('autofix.status.ruleUnavailable.body')
    case 'ambiguous_match':
      return t('autofix.status.ambiguousMatch.body')
    case 'retry_cap':
      return t('autofix.status.retryCap.body')
    case 'empty_patch':
      return t('autofix.status.emptyPatch.body')
    default:
      return t('autofix.status.notGenerated.body')
  }
}
