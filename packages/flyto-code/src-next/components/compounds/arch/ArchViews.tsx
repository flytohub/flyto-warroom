// Architecture views barrel — one export per war-room nav item.
// Internals live under ./arch_views/, split out from the original
// 1468-LOC monolith for readability and per-page test isolation.
export { ArchOverview } from './arch_views/ArchOverview'
export { ArchDeadCode } from './arch_views/ArchDeadCode'
export { ArchFrameworks } from './arch_views/ArchFrameworks'
export { ArchComplexity, ArchImports } from './arch_views/ArchSimple'
export { ArchAPI } from './arch_views/ArchAPI'
export { ArchRepos } from './arch_views/ArchRepos'
export { ArchDeps } from './ArchDetailViews'
