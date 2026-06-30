/**
 * managerShared — small pure helpers shared by the posture/scoring
 * manager-mode views. Keeps the views themselves declarative and the
 * grade→token mapping in one place.
 *
 * The _shared GaugeChart `grade` prop expects the GRADE_TONE keys
 * (bad/warn/fair/neutral/good), but the scoring engine emits letter
 * grades (A+/A/B/.../F) and numeric 0–100 displays. These map a
 * letter or a numeric score onto the right grade-tone bucket so the
 * gauges / chips color correctly without inlining any hex.
 */

import type { Grade } from '@lib/tokens/severity'

/** Map an engine letter grade (A+, A, B, C, D, F …) to a GRADE_TONE key. */
export function letterToGradeTone(letter?: string | null): Grade {
  const l = (letter ?? '').trim().toUpperCase()
  if (!l) return 'neutral'
  const head = l[0]
  switch (head) {
    case 'A':
      return 'good'
    case 'B':
      return 'fair'
    case 'C':
      return 'warn'
    case 'D':
    case 'E':
    case 'F':
      return 'bad'
    default:
      return 'neutral'
  }
}

/** Map a 0–100 score onto a GRADE_TONE key (fallback when no letter). */
export function scoreToGradeTone(score?: number | null): Grade {
  if (score == null) return 'neutral'
  if (score >= 90) return 'good'
  if (score >= 75) return 'fair'
  if (score >= 60) return 'warn'
  return 'bad'
}

/** Best-effort grade-tone for a score row: prefer the letter, fall
 *  back to the numeric bucket. */
export function gradeTone(letter?: string | null, score?: number | null): Grade {
  const l = (letter ?? '').trim()
  return l ? letterToGradeTone(l) : scoreToGradeTone(score)
}

/** Human percentile phrasing for the narrative copy. */
export function percentileNarrative(pct?: number): string {
  if (pct == null) return ''
  if (pct >= 90) return `top ${100 - Math.round(pct)}% of sector peers`
  if (pct >= 50) return `ahead of ${Math.round(pct)}% of sector peers`
  return `behind ${100 - Math.round(pct)}% of sector peers`
}
