import { describe, expect, it } from 'vitest'
import {
  getModulesByPackage,
  MODULE_PACKAGE_ORDER,
  MODULES,
} from '@code/modules'

const CE_FORBIDDEN_MODULE_IDS = new Set([
  'enterprise_control_plane',
  'social_media',
  'mobile_apps',
  'newly_registered_domains',
  'website_watermarking',
  'detection_rules',
  'cloud_storage_exposure',
])

describe('workspace CE module split/merge boundary contract', () => {
  it('assigns every CE workspace module to exactly one physical package', () => {
    const packageNames = new Set(MODULE_PACKAGE_ORDER)
    const ids = new Set<string>()
    const paths = new Set<string>()

    expect(MODULES.length).toBeGreaterThan(40)

    for (const module of MODULES) {
      expect(module.boundary, `${module.id} must declare boundary metadata`).toBeTruthy()
      expect(packageNames.has(module.boundary!.package), `${module.id} uses an unknown package`).toBe(true)

      expect(ids.has(module.id), `duplicate module id: ${module.id}`).toBe(false)
      ids.add(module.id)

      expect(paths.has(module.path), `duplicate module path: ${module.path}`).toBe(false)
      paths.add(module.path)
    }
  })

  it('keeps every generated CE module free of moat markers', () => {
    expect(MODULES.length).toBeGreaterThan(40)

    for (const module of MODULES) {
      expect(module.boundary!.exportable, `${module.id} is not CE-exportable`).toBe(true)
      expect(module.boundary!.edition, `${module.id} is not CE-owned`).toBe('ce')
      expect(module.boundary!.moat, `${module.id} leaks a moat marker into CE export`).toBe('none')
      expect(module.boundary!.licenseTier, `${module.id} is not community-tier`).toBe('community')
    }
  })

  it('keeps enterprise and future-only surfaces out of generated CE source', () => {
    const ids = new Set(MODULES.map((module) => module.id))
    const nonExportable = MODULES.filter((module) => module.boundary?.exportable === false)

    expect(nonExportable).toEqual([])
    for (const id of CE_FORBIDDEN_MODULE_IDS) {
      expect(ids.has(id), `${id} must not be present in generated CE source`).toBe(false)
    }
  })

  it('can split by package and merge back into the unified cockpit', () => {
    for (const packageName of MODULE_PACKAGE_ORDER) {
      const packaged = getModulesByPackage(packageName)

      expect(packaged.length, `${packageName} package should not be empty`).toBeGreaterThan(0)

      for (const module of packaged) {
        expect(module.boundary?.package).toBe(packageName)
        expect(module.boundary?.mergeSurface).toBeTruthy()
      }
    }
  })
})
