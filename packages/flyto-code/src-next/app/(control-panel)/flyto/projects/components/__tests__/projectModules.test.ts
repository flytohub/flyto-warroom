import { describe, it, expect } from 'vitest'
import { PROJECT_MODULES, buildModuleSources, deriveCustomFeatures, deriveProjectType, modulesFromRegistry } from '../projectModules'

/**
 * Entitlement contract guard.
 *
 * The engine gates its endpoints on access-v2 *entitlement* features
 * (surface_code / surface_external / surface_cloud / surface_container,
 * scoring_unified, …) that are DIFFERENT names from the product/page
 * features (code_audit / ctem / …). For project_type=custom projects the
 * backend keeps ONLY the customFeatures the wizard sends, so a module that
 * forgets its entitlement feature makes its endpoints 403 even though the
 * page is visible. This bit us twice — the GitHub repo picker (surface_code)
 * and the dashboard score (scoring_unified). This test pins the mapping so a
 * dropped entitlement fails CI instead of shipping a silent 403.
 *
 * When a surface module gains a new backend-gated endpoint, add the feature
 * the engine's requireSurfaceRead / requireOrgAccess checks for to its
 * `features` here AND to the expectation below.
 */
const REQUIRED_FEATURES: Record<string, string[]> = {
  // surface entitlement + unified scoring + asset-map + the product feature
  code_audit: ['surface_code', 'scoring_unified', 'asset_map', 'code_audit'],
  ctem: ['surface_external', 'scoring_unified', 'ctem'],
  cspm: ['surface_cloud', 'scoring_unified', 'cspm'],
  container: ['surface_container', 'container'],
}

/**
 * The COMPLETE set of entitlement features the engine gates endpoints on
 * (audited 2026-06-04 from requireSurfaceRead/requireOrgAccess/gated across
 * api/*.go). For project_type=custom the resolved features are the union of
 * the enabled modules' `features`, so the wizard MUST be able to emit every
 * one of these or some endpoint 403s. `surface_code` alone gates ~105
 * endpoints — one missing entitlement = a wall of 403s. When the backend
 * adds a new feature gate, add it here AND to the module that owns it.
 */
const BACKEND_GATED_FEATURES = [
  'surface_code', 'surface_external', 'surface_cloud', 'surface_container',
  'scoring_unified', 'asset_map', 'brand_protection', 'compliance',
  'executive_report', 'ctem',
]

/**
 * Page-level features that are not merely endpoint entitlements. If the
 * wizard cannot emit these exact ids, the route and API can both exist while
 * the workspace still renders "Module not enabled".
 */
const BACKEND_PAGE_FEATURES = [
  'product_verification',
]

const moduleById = (id: string) => PROJECT_MODULES.find((m) => m.id === id)

/** Everything the wizard can possibly send as customFeatures. */
const wizardFeatureUniverse = new Set(PROJECT_MODULES.flatMap((m) => m.features))

describe('projectModules entitlement contract', () => {
  for (const [id, required] of Object.entries(REQUIRED_FEATURES)) {
    it(`${id} module declares its entitlement features`, () => {
      const mod = moduleById(id)
      expect(mod, `module ${id} missing from PROJECT_MODULES`).toBeTruthy()
      for (const feat of required) {
        expect(
          mod!.features,
          `module ${id} must declare entitlement feature "${feat}" or its endpoints 403 on custom projects`,
        ).toContain(feat)
      }
    })
  }

  it('every scoreable surface module carries scoring_unified', () => {
    // code/external/cloud surfaces all feed the unified dashboard score.
    for (const id of ['code_audit', 'ctem', 'cspm']) {
      expect(moduleById(id)!.features).toContain('scoring_unified')
    }
  })

  it('a custom project picking Code resolves the score + repo + asset-map entitlements', () => {
    // Mirrors the wizard: enabling Code (plus anything that forces custom)
    // must still expand to the features the engine code/score endpoints need.
    const feats = deriveCustomFeatures(new Set(['code_audit', 'container']))
    expect(feats).toContain('surface_code')   // /github/* , 105 code endpoints
    expect(feats).toContain('scoring_unified') // /computed-score
    expect(feats).toContain('asset_map')       // /asset-map (the 3D)
  })

  it('Product Verification is a visible live workspace module backed by code gates', () => {
    const mod = moduleById('product_verification')

    expect(mod, 'product_verification must be selectable in the create-project wizard').toBeTruthy()
    expect(mod?.status).toBe('live')
    expect(mod?.landingPath).toBe('product-verification')
    expect(mod?.crossCutting).toBe(true)
    expect(mod?.sourceSelectable).toBe(false)
    expect(mod?.features).toEqual(expect.arrayContaining([
      'surface_code',
      'code_audit',
      'product_verification',
    ]))
  })

  it('a Code project with Product Verification emits the page feature and stays custom-gated', () => {
    const enabled = new Set(['code_audit', 'product_verification'])
    const feats = deriveCustomFeatures(enabled)

    expect(deriveProjectType(enabled)).toBe('custom')
    expect(feats).toContain('surface_code')
    expect(feats).toContain('code_audit')
    expect(feats).toContain('product_verification')
    expect(buildModuleSources(enabled, {})).toContainEqual({ module: 'product_verification', source: 'flyto' })
  })

  it('registry modules stay compatible with legacy wizard module ids', () => {
    const registryModules = modulesFromRegistry([
      {
        key: 'code',
        display_name: 'Code Security',
        description: 'Scan source code.',
        category: 'surface',
        risk_level: 'medium',
        status: 'live',
        landing_path: 'issues',
        source_selectable: true,
        flyto_native: true,
        default_enabled: true,
        features: ['surface_code', 'code_audit'],
        providers: [],
      },
    ])

    expect(registryModules).toBeTruthy()
    expect(registryModules?.[0]).toMatchObject({
      id: 'code',
      titleFallback: 'Code Security',
      sourceSelectable: true,
    })
    expect(deriveCustomFeatures(new Set(['code_audit']), registryModules!)).toEqual(['surface_code', 'code_audit'])
    expect(buildModuleSources(new Set(['code_audit']), {}, registryModules!)).toContainEqual({ module: 'code', source: 'flyto' })
  })

  it('the wizard can emit every entitlement feature the backend gates on', () => {
    // The systemic guard: if the backend gates an endpoint on a feature no
    // module can send, every custom project 403s on it. Catch it here.
    const uncovered = BACKEND_GATED_FEATURES.filter((f) => !wizardFeatureUniverse.has(f))
    expect(uncovered, `wizard cannot emit backend-gated feature(s): ${uncovered.join(', ')}`).toEqual([])
  })

  it('the wizard can emit backend page features used by workspace gates', () => {
    const uncovered = BACKEND_PAGE_FEATURES.filter((f) => !wizardFeatureUniverse.has(f))
    expect(uncovered, `wizard cannot emit backend page feature(s): ${uncovered.join(', ')}`).toEqual([])
  })
})

/**
 * Frontend↔backend catalog contract.
 *
 * PROJECT_MODULES is the OFFLINE FALLBACK the wizard renders when the
 * /module-registry fetch fails or is still loading — flyto-engine's
 * catalog.yaml is the source of truth, this is just defensive insurance. But a
 * fallback that has drifted from the catalog is worse than none (it would
 * offer modules the backend doesn't know, or miss ones it does). This pins the
 * fallback's module-id set: when you add/remove a module in catalog.yaml,
 * update PROJECT_MODULES AND this list in the same change, or CI fails here.
 *
 * The frontend uses alias ids (code_audit/ctem/cspm/mcp) and folds
 * autofix+red_team+runtime_protection into the 'addons' group, so this is the
 * wizard's id set, not a 1:1 mirror of catalog keys. 'core' is absent — it's
 * the always-on shell (source_selectable: false, never offered in the wizard).
 */
const EXPECTED_WIZARD_MODULE_IDS = [
  'addons', 'code_audit', 'container', 'cspm', 'ctem', 'dark_web',
  'identity', 'mcp', 'product_verification', 'reporting', 'vuln_mgmt',
]

describe('projectModules ↔ backend catalog contract', () => {
  it('PROJECT_MODULES fallback id set is pinned (sync with catalog.yaml on add/remove)', () => {
    expect(PROJECT_MODULES.map((m) => m.id).sort()).toEqual(EXPECTED_WIZARD_MODULE_IDS)
  })

  it('modulesFromRegistry reads gating_features as the gate and carries billing through', () => {
    const mods = modulesFromRegistry([
      {
        key: 'code', display_name: 'Code Security', description: 'x',
        category: 'surface', risk_level: 'medium', status: 'live',
        source_selectable: true, flyto_native: true, default_enabled: true,
        features: [], gating_features: ['surface_code', 'code_audit'],
        billing: 'paid', providers: [],
      },
    ])
    // features falls back to gating_features when the grant list is empty
    expect(mods?.[0].features).toEqual(['surface_code', 'code_audit'])
    // billing flows through so the wizard's price badge can read it
    expect(mods?.[0].billing).toBe('paid')
  })
})
