/**
 * Footprint scene layout: deterministic orbital sectors.
 *
 * The graph keeps a cosmic feel without becoming a knot:
 * - radius = discovery depth
 * - angle sector = first-hop branch
 * - sibling offset = small angular spread inside the sector
 */

import * as THREE from 'three'
import type { FootprintEntity } from '@lib/engine/code/footprintGraph'
import { entityKind } from './types'

const ORBIT_RADIUS_STEP = 2.75
const SECTOR_PAD = 0.34
const SIBLING_SPREAD = 0.22

/** Remove TypeOrganization entities whose canonical_name matches a
 *  TypeDomain in the same graph. Engine stops creating these going
 *  forward, but historical rows persist. */
export function dedupeRedundantOrgs(entities: FootprintEntity[]): FootprintEntity[] {
  const domainCanon = new Set(
    entities
      .filter(e => e.type === 'domain')
      .map(e => e.canonical_name.toLowerCase()),
  )
  return entities.filter(e => {
    if (e.type !== 'organization') return true
    return !domainCanon.has(e.canonical_name.toLowerCase())
  })
}

export function layerPositions(entities: FootprintEntity[]): Map<string, THREE.Vector3> {
  const roots: FootprintEntity[] = []
  const chain: FootprintEntity[] = []
  const standalones: FootprintEntity[] = []

  for (const e of entities) {
    if (entityKind(e.type) === 'standalone') {
      standalones.push(e)
    } else if (e.depth === 0) {
      roots.push(e)
    } else {
      chain.push(e)
    }
  }

  const positions = new Map<string, THREE.Vector3>()
  placeRoots(roots, positions)
  placeOrbitalSectors(chain, entities, positions)
  placeStandaloneHalo(standalones, chain, positions)
  return positions
}

function placeRoots(roots: FootprintEntity[], positions: Map<string, THREE.Vector3>) {
  if (roots.length === 0) return
  if (roots.length === 1) {
    positions.set(roots[0].id, new THREE.Vector3(0, 0, 0))
    return
  }
  roots.forEach((e, i) => {
    const yOffset = (i - (roots.length - 1) / 2) * 1.05
    positions.set(e.id, new THREE.Vector3(0, yOffset, 0))
  })
}

function placeOrbitalSectors(
  chain: FootprintEntity[],
  allEntities: FootprintEntity[],
  positions: Map<string, THREE.Vector3>,
) {
  const byId = new Map(allEntities.map(e => [e.id, e]))
  const branchKeys = orderedBranchKeys(chain, byId)
  const branchIndex = new Map(branchKeys.map((id, i) => [id, i]))
  const sectorCount = Math.max(branchKeys.length, 1)
  const sectorWidth = (Math.PI * 2) / sectorCount
  const depthBuckets = depthBucketsByBranch(chain, byId)

  for (const e of chain) {
    const branchID = branchRootID(e, byId)
    const baseAngle = sectorAngle(branchIndex.get(branchID) ?? 0, sectorCount)
    const siblings = depthBuckets.get(`${branchID}|${e.depth}`) ?? [e]
    const siblingIndex = siblings.findIndex(x => x.id === e.id)
    const centered = siblingIndex - (siblings.length - 1) / 2
    const maxSpread = Math.max(0.04, sectorWidth / 2 - SECTOR_PAD)
    const angleOffset = THREE.MathUtils.clamp(centered * SIBLING_SPREAD, -maxSpread, maxSpread)
    const radius = e.depth * ORBIT_RADIUS_STEP + Math.min(Math.abs(centered) * 0.28, 0.9)
    const angle = baseAngle + angleOffset
    positions.set(e.id, new THREE.Vector3(
      Math.cos(angle) * radius,
      (e.depth - 1) * 0.42,
      Math.sin(angle) * radius,
    ))
  }
}

function placeStandaloneHalo(
  standalones: FootprintEntity[],
  chain: FootprintEntity[],
  positions: Map<string, THREE.Vector3>,
) {
  if (standalones.length === 0) return
  const maxDepth = Math.max(0, ...chain.map(e => e.depth))
  const haloRadius = (maxDepth + 2) * ORBIT_RADIUS_STEP
  const phi = Math.PI * (3 - Math.sqrt(5))

  standalones.forEach((e, i) => {
    const yRaw = (1 - (i / Math.max(standalones.length - 1, 1)) * 2) * 0.35
    const r = Math.sqrt(1 - yRaw * yRaw)
    const theta = phi * i
    positions.set(e.id, new THREE.Vector3(
      Math.cos(theta) * r * haloRadius,
      yRaw * haloRadius,
      Math.sin(theta) * r * haloRadius,
    ))
  })
}

function depthBucketsByBranch(
  chain: FootprintEntity[],
  byId: Map<string, FootprintEntity>,
): Map<string, FootprintEntity[]> {
  const out = new Map<string, FootprintEntity[]>()
  for (const e of chain) {
    const key = `${branchRootID(e, byId)}|${e.depth}`
    const list = out.get(key) ?? []
    list.push(e)
    out.set(key, list)
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
  }
  return out
}

function orderedBranchKeys(
  chain: FootprintEntity[],
  byId: Map<string, FootprintEntity>,
): string[] {
  return Array.from(new Set(chain.map(e => branchRootID(e, byId)))).sort((a, b) => {
    const da = byId.get(a)?.canonical_name ?? a
    const db = byId.get(b)?.canonical_name ?? b
    return da.localeCompare(db)
  })
}

function branchRootID(entity: FootprintEntity, byId: Map<string, FootprintEntity>): string {
  let cur = entity
  while (cur.parent_entity_id) {
    const parent = byId.get(cur.parent_entity_id)
    if (!parent || parent.depth === 0) break
    cur = parent
  }
  return cur.id
}

function sectorAngle(index: number, total: number): number {
  return ((index / Math.max(total, 1)) * Math.PI * 2) - Math.PI / 2
}

/** Curved Bezier edge. The control point bows away from the centre,
 *  so edges read like orbital arcs instead of wires through planets. */
export function curvedPoints(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
  const outward = new THREE.Vector3(mid.x, 0, mid.z)
  if (outward.lengthSq() > 0.001) {
    outward.normalize().multiplyScalar(0.45 + Math.min(mid.length() * 0.04, 0.7))
    mid.add(outward)
  }
  mid.y += 0.42
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
  return curve.getPoints(28)
}
