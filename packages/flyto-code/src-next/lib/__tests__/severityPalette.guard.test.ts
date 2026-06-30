/**
 * Severity-palette drift guard.
 *
 * 2026-06-03 audit found FIVE disagreeing severity colour tables across
 * the app (low was variously slate / green / blue / cyan / green). They
 * were converged onto the single canonical `SEVERITY_TONE`
 * (lib/tokens/severity.ts): low = neutral slate, high = orange.
 *
 * This test locks that in. It:
 *   1. asserts the canonical anchors never silently change, and
 *   2. statically scans every source file for inline severity maps
 *      (an object with `critical: '#ef4444'` and a sibling `low:` hex)
 *      and fails if any `low` is not the canonical slate.
 *
 * If you are adding a new severity badge/colour, import `severityColor`
 * from @atoms/SeverityChip or `SEVERITY_TONE` from @lib/tokens/severity
 * instead of inlining a hex map — that is what keeps this green.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { SEVERITY_TONE, LETTER_GRADE_TONE } from '../tokens/severity'

const SRC_NEXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../')

// The canonical severity anchors. SEVERITY_TONE is the single source of
// truth; if a brand recolour is intended, update it there AND here.
const CANON = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#64748b', // slate — a low-severity finding is still a finding, not "clean"
  neutral: '#94a3b8',
} as const

// The canonical A→F letter-grade ramp: A green → B lime → C yellow →
// D orange → F red. LETTER_GRADE_TONE is the single source of truth.
const CANON_GRADE = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
} as const

describe('severity palette — canonical anchors', () => {
  it('SEVERITY_TONE matches the locked anchors', () => {
    expect(SEVERITY_TONE.critical.tone.toLowerCase()).toBe(CANON.critical)
    expect(SEVERITY_TONE.high.tone.toLowerCase()).toBe(CANON.high)
    expect(SEVERITY_TONE.medium.tone.toLowerCase()).toBe(CANON.medium)
    expect(SEVERITY_TONE.low.tone.toLowerCase()).toBe(CANON.low)
    expect(SEVERITY_TONE[''].tone.toLowerCase()).toBe(CANON.neutral)
  })

  it('LETTER_GRADE_TONE matches the locked anchors', () => {
    expect(LETTER_GRADE_TONE.A.tone.toLowerCase()).toBe(CANON_GRADE.A)
    expect(LETTER_GRADE_TONE.B.tone.toLowerCase()).toBe(CANON_GRADE.B)
    expect(LETTER_GRADE_TONE.C.tone.toLowerCase()).toBe(CANON_GRADE.C)
    expect(LETTER_GRADE_TONE.D.tone.toLowerCase()).toBe(CANON_GRADE.D)
    expect(LETTER_GRADE_TONE.F.tone.toLowerCase()).toBe(CANON_GRADE.F)
  })
})

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.gen.ts')) out.push(full)
  }
  return out
}

// Read the whole source tree ONCE at module load (not per-test) so the
// two scans share the work — a per-test full walk pushes the suite past
// the default 5s test timeout under parallel CPU load.
const FILES: ReadonlyArray<readonly [string, string]> = walk(SRC_NEXT).map(
  (f) => [path.relative(SRC_NEXT, f), readFileSync(f, 'utf-8')] as const,
)

// Finds an inline severity map anchored on `critical: '#ef4444'` and
// captures the sibling `low`/`LOW` hex within the same object literal.
// Allows an optional 2-digit alpha suffix (e.g. '#64748b20').
const SEV_MAP_RE =
  /(?:critical|CRITICAL)\s*:\s*'#ef4444[0-9a-fA-F]{0,2}'[\s\S]{0,240}?\b(?:low|LOW)\s*:\s*'(#[0-9a-fA-F]{6})[0-9a-fA-F]{0,2}'/g

describe('severity palette — no inline drift', () => {
  it('every inline severity map uses the canonical slate for low', () => {
    const violations: string[] = []
    for (const [rel, text] of FILES) {
      for (const m of text.matchAll(SEV_MAP_RE)) {
        const low = m[1].toLowerCase()
        if (low !== CANON.low && low !== CANON.neutral) {
          violations.push(`${rel}: low = ${low} (expected ${CANON.low})`)
        }
      }
    }
    expect(violations, `Inline severity palette drift — route through SEVERITY_TONE:\n${violations.join('\n')}`).toEqual([])
  }, 30_000)
})

// Finds a plain inline A→F letter-grade hex map (A: '#..' .. B: '#..'
// .. F: '#..'). Object-shaped badge maps ({ bg, fg }) are intentionally
// NOT matched — a badge background carrying white text legitimately uses
// a darker shade for contrast (e.g. the public scorecard).
const GRADE_MAP_RE =
  /\bA\s*:\s*'(#[0-9a-fA-F]{6})'[\s\S]{0,30}?\bB\s*:\s*'(#[0-9a-fA-F]{6})'[\s\S]{0,400}?\bF\s*:\s*'(#[0-9a-fA-F]{6})'/g

describe('letter-grade palette — no inline drift', () => {
  it('every plain A→F grade map uses the canonical ramp', () => {
    const violations: string[] = []
    for (const [rel, text] of FILES) {
      for (const m of text.matchAll(GRADE_MAP_RE)) {
        const [, a, b, f] = m.map((x) => x?.toLowerCase())
        if (a !== CANON_GRADE.A || b !== CANON_GRADE.B || f !== CANON_GRADE.F) {
          violations.push(`${rel}: A=${a} B=${b} F=${f} (expected A=${CANON_GRADE.A} B=${CANON_GRADE.B} F=${CANON_GRADE.F})`)
        }
      }
    }
    expect(violations, `Inline letter-grade drift — route through LETTER_GRADE_TONE:\n${violations.join('\n')}`).toEqual([])
  }, 30_000)
})
