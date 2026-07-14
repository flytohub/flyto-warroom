import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import cjkBaseline from './i18nHardcodedCJK.baseline.json'

/**
 * i18n hardcoded-CJK guard.
 *
 * User-facing strings must go through tOr('code.key','English fallback')
 * (tOr fallbacks are English; the localized text lives in flyto-i18n). A
 * literal CJK (Chinese) string rendered in code therefore ships untranslated
 * to EVERY locale — the worst i18n defect class, and one no type check or
 * build catches. The ultracode audit found exactly this (PostureSnapshotChart
 * shipped a hardcoded 態勢穩定 string to all users).
 *
 * This pins it: after stripping comments, product source may not add new CJK
 * literals beyond the legacy baseline. Chinese in comments (operator quotes,
 * design notes) is fine and common, so it is stripped first. Scope excludes
 * the @fuse/ template (treated as an unmodified dependency) and tests.
 *
 * The baseline is intentionally shrinking-only. When a hardcoded literal is
 * migrated to flyto-i18n, remove its entry from i18nHardcodedCJK.baseline.json.
 */
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..', '..', '..') // src-next/

const CJK = /[一-鿿㐀-䶿]/

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* */ and JSX {/* */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // // line comments (avoid http://)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '@fuse') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

describe('i18n hardcoded-CJK contract', () => {
  const files = walk(srcRoot)
  const baseline = new Set<string>(cjkBaseline as string[])

  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('does not add hardcoded CJK strings beyond the shrinking baseline', () => {
    const offenders: string[] = []
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      stripped.split('\n').forEach((line, i) => {
        if (CJK.test(line)) {
          offenders.push(`${file.slice(srcRoot.length + 1)}:${i + 1}  ${line.trim().slice(0, 80)}`)
        }
      })
    }

    const current = new Set(offenders)
    const added = offenders.filter(offender => !baseline.has(offender))
    const resolved = [...baseline].filter(offender => !current.has(offender))

    expect(
      added,
      `New hardcoded CJK found in code (not a comment). Route user-facing text ` +
        `through tOr('code.key','English fallback') and put localized text in flyto-i18n. ` +
        `Existing baseline count: ${baseline.size}. Resolved baseline entries ready to remove: ${resolved.length}.`,
    ).toEqual([])
  })
})
