import { describe, expect, it } from 'vitest'
import {
  getModulesByPackage,
  MODULE_PACKAGE_ORDER,
  MODULES,
} from '@code/modules'

const NON_EXPORTABLE_IDS = new Set([
  'enterprise_control_plane',
  'social_media',
  'mobile_apps',
  'newly_registered_domains',
  'website_watermarking',
  'detection_rules',
  'cloud_storage_exposure',
])

describe('workspace module split/merge boundary contract', () => {
  it('assigns every workspace module to exactly one physical package', () => {
    const packageNames = new Set(MODULE_PACKAGE_ORDER)
    const ids = new Set<string>()
    const paths = new Set<string>()

    expect(MODULES.length).toBeGreaterThan(50)

    for (const module of MODULES) {
      expect(module.boundary, `${module.id} must declare boundary metadata`).toBeTruthy()
      expect(packageNames.has(module.boundary!.package), `${module.id} uses an unknown package`).toBe(true)

      expect(ids.has(module.id), `duplicate module id: ${module.id}`).toBe(false)
      ids.add(module.id)

      expect(paths.has(module.path), `duplicate module path: ${module.path}`).toBe(false)
      paths.add(module.path)
    }
  })

  it('keeps CE-exportable modules free of moat markers', () => {
    const exportable = MODULES.filter((module) => module.boundary?.exportable)

    expect(exportable.length).toBeGreaterThan(45)

    for (const module of exportable) {
      expect(module.boundary!.edition, `${module.id} is exportable but not CE-owned`).toBe('ce')
      expect(module.boundary!.moat, `${module.id} leaks a moat marker into CE export`).toBe('none')
      expect(module.boundary!.licenseTier, `${module.id} is exportable but not community-tier`).toBe('community')
    }
  })

  it('keeps enterprise and future-only surfaces out of CE export', () => {
    const nonExportableIds = new Set(
      MODULES.filter((module) => module.boundary?.exportable === false).map((module) => module.id),
    )

    expect(nonExportableIds).toEqual(NON_EXPORTABLE_IDS)

    const enterpriseControl = MODULES.find((module) => module.id === 'enterprise_control_plane')
    expect(enterpriseControl?.boundary).toMatchObject({
      edition: 'enterprise',
      exportable: false,
      package: 'enterprise',
      mergeSurface: 'enterprise',
      moat: 'enterprise-control-plane',
      licenseTier: 'enterprise',
    })
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
