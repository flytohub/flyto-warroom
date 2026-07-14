import type { Module, ModuleBoundary, ModulePackage } from '../Module'

export type ModuleDefinition = Omit<Module, 'boundary'> & { boundary?: Partial<ModuleBoundary> }

type BoundaryDefaults = Omit<ModuleBoundary, 'package'>

export function defineModulePackage(
  packageName: ModulePackage,
  defaults: BoundaryDefaults,
  modules: ModuleDefinition[],
): Module[] {
  return modules.map((module) => ({
    ...module,
    boundary: {
      package: packageName,
      ...defaults,
      ...(module.boundary ?? {}),
    },
  }))
}
