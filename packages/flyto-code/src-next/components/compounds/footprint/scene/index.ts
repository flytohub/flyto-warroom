/**
 * @compounds/footprint/scene — 3D scene module.
 *
 * Barrel export for the Phase 5 split. Public surface:
 *   - Scene + SceneProps          — the orchestrator + props shape
 *   - NodeMesh + NodeMeshProps    — single node, exported if a
 *                                    different scene wants to reuse
 *   - EdgeLine + EdgeLineProps    — single edge, same
 *   - ScenePalette + DARK_PALETTE + LIGHT_PALETTE — theme palettes
 *   - entityKind / typeMeta / TYPE_META — entity metadata helpers
 *   - isInconclusiveDocument      — legacy-data filter
 *   - layerPositions / curvedPoints / dedupeRedundantOrgs — pure
 *                                    layout math (testable)
 *
 * The single FootprintGraphView.tsx orchestrator imports from here.
 */

export { Scene } from './Scene'
export type { SceneProps } from './Scene'
export { NodeMesh } from './NodeMesh'
export type { NodeMeshProps } from './NodeMesh'
export { EdgeLine } from './EdgeLine'
export type { EdgeLineProps } from './EdgeLine'
export {
  TIER_PALETTE,
  SIGNAL_GLOW,
  GRADE_HALO,
  DARK_PALETTE,
  LIGHT_PALETTE,
  type ScenePalette,
} from './palette'
export {
  entityKind,
  typeMeta,
  TYPE_META,
  isInconclusiveDocument,
  type EntityKind,
} from './types'
export {
  dedupeRedundantOrgs,
  layerPositions,
  curvedPoints,
} from './layout'
