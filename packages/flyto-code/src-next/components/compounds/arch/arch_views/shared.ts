// Shared constants, helpers, and hooks for the architecture views.
// Split from ArchViews.tsx (was 1468 LOC) so individual pages stay
// readable and testable in isolation.

import { useQuery } from '@tanstack/react-query'
import { getOrgArchMap, type ConnectedRepo } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { LETTER_GRADE_TONE } from '@lib/tokens/severity'

export const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#eab308',
  PATCH: '#f97316', DELETE: '#ef4444', HEAD: '#94a3b8', OPTIONS: '#94a3b8',
}

export const TYPE_COLORS: Record<string, string> = {
  backend: '#f97316', frontend: '#38bdf8', library: '#22c55e',
  mobile: '#e879f9', cli: '#a78bfa', api: '#fb923c',
}

// Derived from canonical LETTER_GRADE_TONE — was B #34d399 (mint),
// now lime to match the single A→F ramp.
export const GRADE_COLOR: Record<string, string> = {
  A: LETTER_GRADE_TONE.A.tone, B: LETTER_GRADE_TONE.B.tone, C: LETTER_GRADE_TONE.C.tone,
  D: LETTER_GRADE_TONE.D.tone, F: LETTER_GRADE_TONE.F.tone,
}

export function repoName(id: string, map: Record<string, ConnectedRepo>): string {
  return map[id]?.repoName ?? map[id]?.fullName ?? id
}

export function typeColor(ptype: string): string {
  return TYPE_COLORS[ptype.toLowerCase()] ?? '#94a3b8'
}

// A3: accepts null (unscored). Returns the same neutral grey as
// an unknown grade so an unscored repo's row chrome doesn't pretend
// to carry a real grade colour. Callers MUST also gate the chip
// LABEL so the user doesn't see "null" / undefined rendered.
export function gradeColor(g: string | null | undefined): string {
  if (!g) return '#94a3b8'
  return GRADE_COLOR[g] ?? '#94a3b8'
}

// Consistent en-US separators regardless of browser locale — the rest
// of the war room uses ',' so locale-flipping mid-page would jar.
export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

// Top-N entries from a Record<string, number>, by value desc.
export function topByValue(m: Record<string, number> | undefined, n: number): Array<[string, number]> {
  if (!m) return []
  return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, n)
}

export function useOrgArch() {
  const { org } = useOrg()
  return useQuery({
    queryKey: qk.repos.archMap(org?.id),
    queryFn: () => getOrgArchMap(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })
}
