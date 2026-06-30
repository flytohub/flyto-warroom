/**
 * Scene — top-level 3D scene orchestrator.
 *
 * Extracted from FootprintGraphView.tsx Phase 5. Owns:
 *   - filter pipeline (actionable-only chain expansion, depth
 *     filter, timeline cursor, redundant-org dedupe, legacy
 *     inconclusive-document drop)
 *   - position computation via layerPositions()
 *   - highlighted-edge set when an entity is selected
 *   - lighting rig + fog + atmosphere + starfield + seed sparkle
 *   - OrbitControls (auto-rotate when nothing selected)
 *   - render loop: edges first, then nodes (z-paint order)
 */

import { useMemo } from 'react'
import { OrbitControls, Stars, Sparkles } from '@react-three/drei'
import {
  actionability,
  type FootprintEntity,
  type FootprintRelationship,
  type FootprintSignalKind,
} from '@lib/engine/code/footprintGraph'
import type { DomainFindingSummary } from '@lib/engine'

import { NodeMesh } from './NodeMesh'
import { EdgeLine } from './EdgeLine'
import { dedupeRedundantOrgs, layerPositions } from './layout'
import { entityKind, isInconclusiveDocument } from './types'
import type { ScenePalette } from './palette'

export interface SceneProps {
  entities: FootprintEntity[]
  rels: FootprintRelationship[]
  signalByEntity: Map<string, FootprintSignalKind>
  selectedId: string | null
  onSelect: (id: string) => void
  palette: ScenePalette
  actionableOnly: boolean
  graphScope: 'focused' | 'expanded' | 'all'
  enabledDepths: Set<number>
  showAllLabels: boolean
  timelineCursor: number | null
  /** Findings overlay map — keyed lowercase by domain (matches
   *  the engine's canonical_name format). Empty / missing entry →
   *  no overlay rendered for that node. */
  overlayByDomain?: Map<string, DomainFindingSummary>
}

export function Scene({
  entities, rels, signalByEntity, selectedId, onSelect, palette,
  actionableOnly, graphScope, enabledDepths, showAllLabels, timelineCursor, overlayByDomain,
}: SceneProps) {
  const selectedContextIds = useMemo(
    () => contextIdsForSelection(selectedId, entities, rels),
    [selectedId, entities, rels],
  )
  // Apply all filters in one pass: actionable-only chain expansion,
  // depth filter, timeline cursor.
  const visibleEntities = useMemo(() => {
    // Drop legacy inconclusive documents (api-key-missing
    // placeholders mirrored before the bridge filter shipped).
    let pool = entities.filter(e => !isInconclusiveDocument(e))
    // Drop redundant Organization entities that overlap a Domain
    // entity with the same canonical_name (historical data from
    // before queue.go's collapse logic landed).
    pool = dedupeRedundantOrgs(pool)
    if (timelineCursor !== null) {
      pool = pool.filter(e => {
        // Guard NaN — Date.parse on malformed input returns NaN
        // which trips comparisons in unexpected ways. Treat
        // unparseable as t=0 (always visible at any cursor).
        if (!e.first_seen_at) return true
        const t = Date.parse(e.first_seen_at)
        if (!Number.isFinite(t)) return true
        return t <= timelineCursor
      })
    }
    if (actionableOnly) {
      const byId = new Map(pool.map(e => [e.id, e]))
      const keep = new Set<string>()
      for (const e of pool) {
        if (actionability(e)?.tier !== 'red_team_actionable') continue
        let cur: FootprintEntity | undefined = e
        while (cur) {
          if (keep.has(cur.id)) break
          keep.add(cur.id)
          cur = cur.parent_entity_id ? byId.get(cur.parent_entity_id) : undefined
        }
      }
      pool = pool.filter(e => keep.has(e.id))
    }
    if (graphScope !== 'all') {
      const byId = new Map(pool.map(e => [e.id, e]))
      const keep = new Set<string>()
      const depthLimit = graphScope === 'focused' ? 2 : 3
      for (const e of pool) {
        if (shouldShowInScopedGraph(e, depthLimit, signalByEntity, selectedContextIds)) {
          addDiscoveryChain(e, byId, keep)
        }
      }
      pool = pool.filter(e => keep.has(e.id))
    }
    pool = pool.filter(e => {
      // Depth 4+ collapses to bucket 4
      const bucket = e.depth >= 4 ? 4 : e.depth
      return enabledDepths.has(bucket)
    })
    return pool
  }, [entities, actionableOnly, graphScope, enabledDepths, timelineCursor, signalByEntity, selectedContextIds])

  const positions = useMemo(() => layerPositions(visibleEntities), [visibleEntities])
  const entitiesById = useMemo(() => new Map(visibleEntities.map(e => [e.id, e])), [visibleEntities])

  // Discovery chain back to seed for the selected entity. Each
  // edge between consecutive ancestors gets highlighted so the
  // operator sees the full "why we reached this" path, not just
  // the local 1-hop neighbourhood.
  const highlightedEdges = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const byId = new Map(entities.map(e => [e.id, e]))
    const chainPairs = new Set<string>() // "from→to"
    let cur = byId.get(selectedId)
    while (cur && cur.parent_entity_id) {
      chainPairs.add(`${cur.parent_entity_id}->${cur.id}`)
      chainPairs.add(`${cur.id}->${cur.parent_entity_id}`)
      cur = byId.get(cur.parent_entity_id)
    }
    const out = new Set<string>()
    for (const r of rels) {
      // Incident edges
      if (r.from_entity === selectedId || r.to_entity === selectedId) {
        out.add(r.id)
        continue
      }
      // Chain edges
      if (chainPairs.has(`${r.from_entity}->${r.to_entity}`)) {
        out.add(r.id)
      }
    }
    return out
  }, [rels, selectedId, entities])

  // Highlighted-node set — selected node + its 1-hop neighbours
  // + every chain ancestor back to the seed. Used by focus mode
  // to dim everything outside the operator's current attention.
  // Operator design 2026-05-23 Codex #5.
  const highlightedNodes = useMemo(() => {
    if (!selectedId) return new Set<string>()
    return selectedContextIds
  }, [selectedId, selectedContextIds])
  // Focus mode is meaningless when the seed is selected — the seed's
  // 1-hop neighbourhood is basically the whole graph. Only activate
  // when the operator picks a downstream entity. Operator hit this
  // on 2026-05-23 ("看了 還是一堆在那邊"); clicking flyto2 had no
  // visual effect because every node was in scope.
  const selectedEntity = selectedId ? entities.find(e => e.id === selectedId) : undefined
  const focusMode = selectedId !== null && (selectedEntity?.depth ?? 99) > 0

  // Position the seed for the seed-sparkle hint below.
  const seedEntity = entities.find(e => e.depth === 0)
  const seedPos = seedEntity ? positions.get(seedEntity.id) : undefined

  return (
    <>
      {/* Theme-aware fog + background — light mode uses cool slate to
          match `background.default`, dark mode keeps the navy. */}
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />
      <color attach="background" args={[palette.background]} />

      {/* Lighting rig — soft fill + violet key + amber rim so the
          standard-material spheres pick up real specular highlights
          rather than reading as flat balls. */}
      <ambientLight intensity={palette.ambientIntensity} />
      <pointLight position={[12, 14, 10]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-10, -8, -12]} intensity={0.55} color="#a78bfa" />
      <pointLight position={[8, -6, 6]} intensity={0.35} color="#fbbf24" />

      {/* Starfield backdrop — only in dark mode. On light it reads as
          JPEG noise rather than depth. */}
      {palette.starCount > 0 && (
        <Stars radius={80} depth={50} count={palette.starCount} factor={3} fade saturation={0} speed={0.4} />
      )}

      {/* Seed sparkle anchor — tiny floating dust pulled to the seed
          so the operator's eye finds the centre instantly. */}
      {seedPos && (
        <group position={seedPos}>
          <Sparkles count={32} scale={2.4} size={2.2} speed={0.4} color="#a78bfa" opacity={0.7} />
        </group>
      )}

      {/* Edges — two visual variants by semantic:
          - SOLID  : both endpoints are chain entities. Confidence
                     ≥ 0.5. Reads as "verified attack-chain hop".
          - DASHED : one endpoint is a standalone (technology /
                     vendor / news / app). Reads as "indicator
                     relationship — uses-vendor, references-source —
                     NOT an attack hop". Operator can still see
                     that Cloudflare belongs to flyto2.com, but the
                     visual weight tells them it's context.
          Edges where BOTH endpoints are standalone are skipped —
          would only happen for parallel co-mentions which aren't
          meaningful here. Edges first, so nodes paint on top. */}
      {rels.map(r => {
        const a = positions.get(r.from_entity)
        const b = positions.get(r.to_entity)
        if (!a || !b) return null
        const fromE = entitiesById.get(r.from_entity)
        const toE = entitiesById.get(r.to_entity)
        if (!fromE || !toE) return null
        const fromKind = entityKind(fromE.type)
        const toKind = entityKind(toE.type)
        if (fromKind === 'standalone' && toKind === 'standalone') return null
        const highlighted = highlightedEdges.has(r.id)
        if (focusMode && !highlighted) return null
        if (!shouldDrawEdge(r, toE, graphScope, highlighted)) return null
        const minConfidence = graphScope === 'all' ? 0.5 : graphScope === 'expanded' ? 0.6 : 0.7
        if (!highlighted && r.confidence < minConfidence) return null
        const isDashed = fromKind === 'standalone' || toKind === 'standalone'
        return (
          <EdgeLine
            key={r.id}
            from={a}
            to={b}
            highlighted={highlighted}
            color={palette.edgeColor}
            highlightColor={palette.edgeHighlight}
            strength={r.confidence}
            dashed={isDashed}
            focusMode={focusMode}
            animated={highlighted}
          />
        )
      })}

      {visibleEntities.map(e => {
        const p = positions.get(e.id)
        if (!p) return null
        const dimmed = focusMode && !highlightedNodes.has(e.id)
        return (
          <NodeMesh
            key={e.id}
            entity={e}
            position={p}
            signal={signalByEntity.get(e.id)}
            isSelected={selectedId === e.id}
            onSelect={() => onSelect(e.id)}
            palette={palette}
            forceLabel={showAllLabels}
            standalone={entityKind(e.type) === 'standalone'}
            findings={overlayByDomain?.get(e.canonical_name.toLowerCase())}
            dimmed={dimmed}
          />
        )
      })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={!selectedId}
        autoRotateSpeed={0.25}
        minDistance={6}
        maxDistance={32}
      />
    </>
  )
}

function contextIdsForSelection(
  selectedId: string | null,
  entities: FootprintEntity[],
  rels: FootprintRelationship[],
): Set<string> {
  const out = new Set<string>()
  if (!selectedId) return out
  out.add(selectedId)
  const byId = new Map(entities.map(e => [e.id, e]))
  let cur = byId.get(selectedId)
  while (cur && cur.parent_entity_id) {
    out.add(cur.parent_entity_id)
    cur = byId.get(cur.parent_entity_id)
  }
  for (const r of rels) {
    if (r.from_entity === selectedId) out.add(r.to_entity)
    if (r.to_entity === selectedId) out.add(r.from_entity)
  }
  return out
}

function shouldDrawEdge(
  rel: FootprintRelationship,
  target: FootprintEntity,
  graphScope: 'focused' | 'expanded' | 'all',
  highlighted: boolean,
): boolean {
  if (highlighted || graphScope === 'all') return true
  if (target.parent_entity_id === rel.from_entity) return true
  return graphScope === 'expanded' && rel.confidence >= 0.85
}

function shouldShowInScopedGraph(
  entity: FootprintEntity,
  depthLimit: number,
  signalByEntity: Map<string, FootprintSignalKind>,
  selectedContextIds: Set<string>,
): boolean {
  const tier = actionability(entity)?.tier
  return (
    entity.depth <= depthLimit ||
    selectedContextIds.has(entity.id) ||
    signalByEntity.has(entity.id) ||
    tier === 'red_team_actionable' ||
    tier === 'needs_more_evidence'
  )
}

function addDiscoveryChain(
  entity: FootprintEntity,
  byId: Map<string, FootprintEntity>,
  keep: Set<string>,
) {
  let cur: FootprintEntity | undefined = entity
  while (cur && !keep.has(cur.id)) {
    keep.add(cur.id)
    cur = cur.parent_entity_id ? byId.get(cur.parent_entity_id) : undefined
  }
}
