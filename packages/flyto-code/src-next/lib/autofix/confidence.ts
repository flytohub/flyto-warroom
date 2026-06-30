/**
 * lib/autofix/confidence.ts — AutoFix patch confidence derivation (arch Phase 5:
 * extracted from AutofixPreviewModal). Pure logic over the verify-gate results +
 * rule tier; produces a level (high/medium/low) + a localized label/reason.
 *
 * TODO(backend-truth): this duplicates engine knowledge (TIER1 allow-list, gate
 * counting). The backend should expose confidence_level + reason key directly;
 * until then keep TIER1_CATEGORIES in sync with the engine tier definition by hand.
 */
import { t } from '@lib/i18n';
import type { AutofixFindingDetail } from '@lib/engine'

const TIER1_CATEGORIES = new Set(['dependencies', 'iac', 'containers', 'pentest'])

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ConfidenceVerdict {
  level: ConfidenceLevel
  label: string
  reason: string
}

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: '#22c55e',
  medium: '#f59e0b',
  low: '#ef4444',
}

export function computeConfidence(detail: AutofixFindingDetail | undefined): ConfidenceVerdict | null {
  if (!detail) return null
  if (detail.confidence) {
    return {
      level: detail.confidence.level,
      label: confidenceLabel(detail.confidence.level),
      reason: confidenceReason(detail),
    }
  }
  const gates = detail.verify_gates ?? []
  const failed  = gates.filter(g => g.status === 'fail' || g.status === 'error')
  const skipped = gates.filter(g => g.status === 'skipped')
  const passed  = gates.filter(g => g.status === 'pass')

  if (failed.length > 0) {
    return {
      level: 'low',
      label: t('autofix.confidenceLow'),
      reason: t('autofix.confidenceReasonFailed')
        .replace('{n}', String(failed.length))
        .replace('{gate}', failed[0].name),
    }
  }
  if (skipped.length > 0 && passed.length === 0) {
    return {
      level: 'low',
      label: t('autofix.confidenceLow'),
      reason: t('autofix.confidenceReasonSkipped')
        .replace('{list}', skipped.map(g => g.name).join(', ')),
    }
  }
  if (TIER1_CATEGORIES.has(detail.rule_category)) {
    return {
      level: 'high',
      label: t('autofix.confidenceHigh'),
      reason: t('autofix.confidenceReasonTier1')
        .replace('{category}', detail.rule_category)
        .replace('{n}', String(passed.length)),
    }
  }
  return {
    level: 'medium',
    label: t('autofix.confidenceMedium'),
    reason: t('autofix.confidenceReasonTier2')
      .replace('{n}', String(passed.length)),
  }
}

function confidenceLabel(level: ConfidenceLevel): string {
  if (level === 'high') return t('autofix.confidenceHigh')
  if (level === 'low') return t('autofix.confidenceLow')
  return t('autofix.confidenceMedium')
}

function confidenceReason(detail: AutofixFindingDetail): string {
  const c = detail.confidence
  if (!c) return ''
  const gates = c.reason_gates ?? []
  switch (c.reason_key) {
    case 'autofix.confidenceReasonFailed':
      return t('autofix.confidenceReasonFailed')
        .replace('{n}', String(gates.length || 1))
        .replace('{gate}', gates[0] ?? 'verify')
    case 'autofix.confidenceReasonSkipped':
      return t('autofix.confidenceReasonSkipped')
        .replace('{list}', gates.join(', ') || 'all')
    case 'autofix.confidenceReasonTier1':
      return t('autofix.confidenceReasonTier1')
        .replace('{category}', detail.rule_category)
        .replace('{n}', String(gates.length))
    case 'autofix.confidenceReasonTier2':
      return t('autofix.confidenceReasonTier2')
        .replace('{n}', String(gates.length))
    default:
      return c.reason_key
  }
}
