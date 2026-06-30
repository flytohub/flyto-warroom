import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

/**
 * "No direct @fuse import in product code" guard (architecture Phase 4).
 *
 * The Fuse template is treated as a swappable dependency: product code imports
 * Fuse primitives through thin adapters in components/adapters/ (Icon, Link,
 * Scrollbars, useThemeMediaQuery, usePathname, useLayoutSettings,
 * useFuseSettings), never `@fuse/*` / `@auth/*` directly. That way, swapping or
 * upgrading the template is a change to the adapter layer, not a 50-file sweep.
 *
 * This baselines the files that STILL import @fuse/@auth directly (the deep
 * couplings — route-config types, the Firebase/JWT auth tabs, error pages — that
 * need a dedicated decoupling pass, not a clean re-export) and asserts the set
 * never GROWS. New code must go through an adapter; the baseline shrinks as each
 * deep coupling gets its adapter. Delete a file from BASELINE when you migrate it.
 *
 * Excluded entirely: the adapter layer itself, and components/theme-layouts/
 * (the Fuse layout shell — product-owned glue that legitimately wires Fuse).
 */
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..', '..', '..') // src-next/
const SCAN_DIRS = ['components', 'hooks', 'app']

// Files still importing @fuse/@auth directly. Shrink as each gets an adapter;
// never add.
const BASELINE = new Set<string>([
  'app/(control-panel)/flyto/callback/route.tsx',
  'app/(control-panel)/flyto/capability/route.tsx',
  'app/(control-panel)/flyto/projects/route.tsx',
  'app/(control-panel)/flyto/workspace/route.tsx',
  'app/(public)/(auth)/components/tabs/sign-in/FirebaseSignInTab.tsx',
  'app/(public)/(auth)/components/tabs/sign-in/JwtSignInTab.tsx',
  'app/(public)/(auth)/components/tabs/sign-up/FirebaseSignUpTab.tsx',
  'app/(public)/(auth)/components/tabs/sign-up/JwSignUpTab.tsx',
  'app/(public)/(auth)/route.tsx',
  'app/(public)/(errors)/components/views/Error401PageView.tsx',
  'app/(public)/(errors)/components/views/Error404PageView.tsx',
  'app/(public)/(errors)/route.tsx',
  'app/(public)/(explore)/route.tsx',
  'app/App.tsx',
  'components/LightDarkModeToggle.tsx',
  'components/PageBreadcrumb.tsx',
  'components/data-table/DataTable.tsx',
])

const FUSE_IMPORT = /from\s+['"]@(fuse|auth)\//

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'adapters' || name === 'theme-layouts') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

describe('no direct @fuse import in product code', () => {
  const offenders = new Set<string>()
  for (const d of SCAN_DIRS) {
    for (const file of walk(join(srcRoot, d))) {
      if (FUSE_IMPORT.test(readFileSync(file, 'utf8'))) {
        offenders.add(relative(srcRoot, file).split(sep).join('/'))
      }
    }
  }

  it('no NEW product file imports @fuse/@auth directly (baseline must not grow)', () => {
    const fresh = [...offenders].filter((f) => !BASELINE.has(f))
    expect(
      fresh,
      `These product files import @fuse/* or @auth/* directly. Add a thin ` +
        `re-export in components/adapters/ and import that instead, so the Fuse ` +
        `template stays swappable.`,
    ).toEqual([])
  })

  it('baseline has no stale entries (migrated files removed from allowlist)', () => {
    const stale = [...BASELINE].filter((f) => !offenders.has(f))
    expect(stale, `These BASELINE entries no longer import @fuse — delete them so they can't regress.`).toEqual([])
  })
})
