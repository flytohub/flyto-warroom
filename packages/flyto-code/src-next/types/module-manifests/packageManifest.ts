import type {
  Module,
  ModuleEdition,
  ModuleGroup,
  ModuleLicenseTier,
  ModuleMoat,
  ModulePackage,
} from '../Module'

export interface ModulePackageManifestEntry {
  package: ModulePackage
  moduleIds: string[]
  moduleCount: number
  routeCount: number
  exportable: boolean
  mergeSurfaces: ModuleGroup[]
  editions: ModuleEdition[]
  moats: ModuleMoat[]
  licenseTiers: ModuleLicenseTier[]
}

export interface ModulePackageManifest {
  schema: 'flyto2.frontend-module-package-manifest.v1'
  generatedBy: 'src-next/types/module-manifests'
  totalModules: number
  exportableModules: number
  nonExportableModuleIds: string[]
  packages: ModulePackageManifestEntry[]
  splitBy: string[]
  mergeThrough: string[]
}

export function buildModulePackageManifest(
  modules: Module[],
  packageOrder: readonly ModulePackage[],
): ModulePackageManifest {
  const byPackage = new Map<ModulePackage, Module[]>()
  for (const packageName of packageOrder) {
    byPackage.set(packageName, [])
  }
  for (const module of modules) {
    const packageName = module.boundary?.package
    if (!packageName) continue
    if (!byPackage.has(packageName)) {
      byPackage.set(packageName, [])
    }
    byPackage.get(packageName)!.push(module)
  }

  const packages = [...byPackage.entries()]
    .filter(([, packageModules]) => packageModules.length > 0)
    .map(([packageName, packageModules]) => {
      const moduleIds = packageModules.map((module) => module.id).sort()
      return {
        package: packageName,
        moduleIds,
        moduleCount: packageModules.length,
        routeCount: packageModules.filter((module) => Boolean(module.path)).length,
        exportable: packageModules.every((module) => module.boundary?.exportable === true),
        mergeSurfaces: uniqueSorted(packageModules.map((module) => module.boundary?.mergeSurface).filter(Boolean)),
        editions: uniqueSorted(packageModules.map((module) => module.boundary?.edition).filter(Boolean)),
        moats: uniqueSorted(packageModules.map((module) => module.boundary?.moat).filter(Boolean)),
        licenseTiers: uniqueSorted(packageModules.map((module) => module.boundary?.licenseTier).filter(Boolean)),
      } satisfies ModulePackageManifestEntry
    })

  return {
    schema: 'flyto2.frontend-module-package-manifest.v1',
    generatedBy: 'src-next/types/module-manifests',
    totalModules: modules.length,
    exportableModules: modules.filter((module) => module.boundary?.exportable === true).length,
    nonExportableModuleIds: modules
      .filter((module) => module.boundary?.exportable === false)
      .map((module) => module.id)
      .sort(),
    packages,
    splitBy: ['package', 'capability', 'edition', 'mergeSurface'],
    mergeThrough: ['workspace-sidebar', 'workspace-router', 'capability-snapshot', 'unified-cockpit'],
  }
}

export function getCEManifestModules(modules: readonly Module[]): Module[] {
  return modules.filter((module) => module.boundary?.exportable === true)
}

export function getCEPackageOrder(
  modules: readonly Module[],
  packageOrder: readonly ModulePackage[],
): ModulePackage[] {
  const packagesWithCEModules = new Set(getCEManifestModules(modules).map((module) => module.boundary!.package))
  return packageOrder.filter((packageName) => packagesWithCEModules.has(packageName))
}

export function buildCEPackageManifest(
  modules: readonly Module[],
  packageOrder: readonly ModulePackage[],
): ModulePackageManifest {
  const ceModules = getCEManifestModules(modules)
  return buildModulePackageManifest(ceModules, getCEPackageOrder(modules, packageOrder))
}

export function validateCEPackageManifest(manifest: ModulePackageManifest): string[] {
  const issues: string[] = []
  if (manifest.totalModules === 0) {
    issues.push('CE module manifest must not be empty')
  }
  if (manifest.nonExportableModuleIds.length > 0) {
    issues.push(`CE manifest contains non-exportable modules: ${manifest.nonExportableModuleIds.join(', ')}`)
  }
  for (const entry of manifest.packages) {
    if (!entry.exportable) {
      issues.push(`CE package ${entry.package} contains non-exportable modules`)
    }
    if (entry.editions.some((edition) => edition !== 'ce')) {
      issues.push(`CE package ${entry.package} contains non-CE editions: ${entry.editions.join(', ')}`)
    }
    if (entry.moats.some((moat) => moat !== 'none')) {
      issues.push(`CE package ${entry.package} contains moat markers: ${entry.moats.join(', ')}`)
    }
    if (entry.licenseTiers.some((tier) => tier !== 'community')) {
      issues.push(`CE package ${entry.package} contains paid license tiers: ${entry.licenseTiers.join(', ')}`)
    }
  }
  return issues
}

function uniqueSorted<T extends string>(values: (T | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].sort()
}
