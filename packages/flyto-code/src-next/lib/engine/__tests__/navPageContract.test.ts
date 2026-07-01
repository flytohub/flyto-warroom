import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getDualModePaths, MODULES, SIDEBAR_GROUP_ORDER } from '@code/modules'

/**
 * Nav permission-gate contract guard.
 *
 * The sidebar renders every module via `caps.canOpenPage(m.capability ?? m.id)`
 * (WorkspaceSidebar.tsx). `canOpenPage` checks backend `page_states` and falls
 * back to `visible_pages`; both use the `pages:` keys in the engine's
 * `internal/permission/capabilities.yaml`. If a module's page-id is NOT one of
 * those keys, fail-closed capability helpers deny it once caps load. We hit
 * exactly this with `containers` gated on the `code_audit` *feature* (not a page).
 *
 * This pins the rule: every sidebar-rendered module's page-id must be a real
 * backend page. The snapshot is regenerated from capabilities.yaml — when the
 * backend adds/removes a page, refresh `__generated__/backend-pages.txt`.
 *
 *   awk '/^pages:/{f=1;next} /^[a-z_]+:/{if(f)exit} f && /^  [a-z_]+:/{gsub(/:/,"");print $1}' \
 *     ../flyto-engine/internal/permission/capabilities.yaml | sort > backend-pages.txt
 */
const here = dirname(fileURLToPath(import.meta.url))
const packagesRoot = join(here, '..', '..', '..', '..', '..')
const engineCatalogPath = join(packagesRoot, 'flyto-engine', 'internal', 'modulecatalog', 'catalog.yaml')
const contractsCapabilitiesPath = join(packagesRoot, 'flyto-contracts', 'capabilities', 'capabilities.yaml')
const BACKEND_PAGES = new Set(
  readFileSync(join(here, '..', '__generated__', 'backend-pages.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean),
)

function collectProjectRegistryPages(): Set<string> {
  const pages = new Set<string>()
  if (!existsSync(engineCatalogPath)) {
    const capabilities = readFileSync(contractsCapabilitiesPath, 'utf8')
    let inPages = false
    for (const line of capabilities.split('\n')) {
      if (line.trim() === 'pages:') {
        inPages = true
        continue
      }
      if (inPages && /^\S/.test(line)) break
      const match = line.match(/^\s{2}([a-z_][a-z0-9_]*):\s*/)
      if (inPages && match) pages.add(match[1])
    }
    return pages
  }

  const catalog = readFileSync(engineCatalogPath, 'utf8')
  for (const match of catalog.matchAll(/^\s+pages:\s*\[([^\]]*)\]/gm)) {
    for (const raw of match[1].split(',')) {
      const page = raw.trim()
      if (page) pages.add(page)
    }
  }
  return pages
}

const PROJECT_REGISTRY_PAGES = collectProjectRegistryPages()
const RENDERED_GROUPS = new Set(SIDEBAR_GROUP_ORDER.map((g) => g.id))

describe('sidebar nav page-id contract', () => {
  it('snapshot is non-empty (regen guard)', () => {
    expect(BACKEND_PAGES.size).toBeGreaterThan(20)
  })

  // Every module that actually renders a sidebar entry in a rendered group
  // must gate on a page-id the backend can put in visible_pages.
  const sidebarModules = MODULES.filter((m) => m.sidebar && RENDERED_GROUPS.has(m.sidebar.group) && m.sidebar.group !== 'hidden')

  it('covers a meaningful number of modules', () => {
    expect(sidebarModules.length).toBeGreaterThan(15)
  })

  for (const m of sidebarModules) {
    const pageId = m.capability ?? m.id
    it(`module '${m.id}' gates on a real backend page ('${pageId}')`, () => {
      expect(
        BACKEND_PAGES.has(pageId),
        `module '${m.id}' (group '${m.sidebar!.group}') uses canSeePage('${pageId}') but ` +
          `'${pageId}' is not a backend page-id. Use the module's page-id (e.g. 'containers', ` +
          `'ioc_lookup'), NOT a feature name. Valid pages live in capabilities.yaml pages:.`,
      ).toBe(true)
    })

    it(`module '${m.id}' is registered in the project module catalog ('${pageId}')`, () => {
      expect(
        PROJECT_REGISTRY_PAGES.has(pageId),
        `module '${m.id}' uses page '${pageId}', but neither the project module catalog nor ` +
          `the CE capability contract lists it. The project capability gate will fail closed, ` +
          `so add the page to the owning module/contract or intentionally hide the module from sidebar.`,
      ).toBe(true)
    })
  }
})

describe('workspace module metadata contract', () => {
  it('registers Asset Coverage as a gated dual-mode Assets route', () => {
    const assetCoverage = MODULES.find((m) => m.id === 'asset_coverage')

    expect(assetCoverage?.path).toBe('asset-coverage')
    expect(assetCoverage?.fullBleed).toBe(true)
    expect(assetCoverage?.dualMode).toBe(true)
    expect(assetCoverage?.sidebar?.group).toBe('assets')
    expect(assetCoverage?.sidebar?.fallback).toBe('Asset Coverage')
    expect(BACKEND_PAGES.has(assetCoverage?.capability ?? assetCoverage!.id)).toBe(true)
  })

  it('drives the Manager / Engineer toolbar from the module manifest', () => {
    const paths = new Set(getDualModePaths())

    expect(paths).toContain('/pentest')
    expect(paths).toContain('/asset-map')
    expect(paths).toContain('/asset-coverage')
    expect(paths).toContain('/findings')

    // Data Leaks is a focused single-mode surface today. Keeping it
    // out of the toolbar is as important as including real ModeView
    // pages: the product can split where useful without forcing every
    // surface into two modes.
    expect(paths).not.toContain('/data-leaks')
  })
})
