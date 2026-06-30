import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

/**
 * "No ad-hoc transport in the view layer" guard (architecture Phase 0).
 *
 * The target architecture: components NEVER touch transport. They call typed
 * fetchers from lib/engine/* (usually via a react-query hook). A component that
 * imports `request` from lib/engine/client, or opens a raw fetch/WebSocket/
 * EventSource, is the "pages calling APIs ad-hoc all over the place" smell the
 * refactor is killing.
 *
 * This does NOT require fixing every legacy violator at once. It snapshots the
 * CURRENT known offenders as BASELINE and asserts the set never GROWS — new
 * code must go through the engine layer, while the baseline shrinks one file at
 * a time as Phase 2 migrates each into lib/engine + a hook. When you migrate a
 * baseline file, delete it from BASELINE so it can't regress.
 */
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..', '..', '..') // src-next/
const VIEW_DIRS = ['components', 'app']

// Known legacy offenders (relative to src-next/, forward-slash). Shrink this
// as Phase 2 migrates each file into lib/engine + a typed hook. Never add.
const BASELINE = new Set<string>([
  'components/compounds/_shared/BrowserLiveView.tsx',
  'components/compounds/settings/SystemEventsTab.tsx',
  'components/compounds/domains/DomainImportModal.tsx',
  'components/compounds/layout/IntegrationHealthBanner.tsx',
  'components/compounds/_shared/ScanUploadDropzone.tsx',
  'components/compounds/settings/ScanningTab.tsx',
  'components/compounds/threat-intel/ThreatIntelRefreshButton.tsx',
])

// Importing the raw transport, or opening a socket/stream by hand.
const TRANSPORT = [
  /from\s+['"]@lib\/engine\/client['"]/, // pulls request()/requestBlob() into a view
  /\bnew\s+EventSource\(/,
  /\bnew\s+WebSocket\(/,
  /(^|[^.\w])fetch\(/, // bare fetch (not .fetch / prefetch / refetch)
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('no ad-hoc transport in the view layer', () => {
  const offenders = new Set<string>()
  for (const d of VIEW_DIRS) {
    for (const file of walk(join(srcRoot, d))) {
      const src = stripComments(readFileSync(file, 'utf8'))
      if (TRANSPORT.some((re) => re.test(src))) {
        offenders.add(relative(srcRoot, file).split(sep).join('/'))
      }
    }
  }

  it('finds the view tree', () => {
    expect(walk(join(srcRoot, 'components')).length).toBeGreaterThan(100)
  })

  it('no NEW component touches transport directly (baseline must not grow)', () => {
    const fresh = [...offenders].filter((f) => !BASELINE.has(f))
    expect(
      fresh,
      `These view files call transport directly (fetch/WebSocket/EventSource or ` +
        `import @lib/engine/client). Route the call through a typed lib/engine/* ` +
        `fetcher + a react-query hook instead. If a baseline migration is in flight, ` +
        `update BASELINE in this test.`,
    ).toEqual([])
  })

  it('baseline has no stale entries (migrated files removed from allowlist)', () => {
    const stale = [...BASELINE].filter((f) => !offenders.has(f))
    expect(stale, `These BASELINE entries no longer violate — delete them so they can't regress.`).toEqual([])
  })
})
