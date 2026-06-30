/**
 * joinLogic — types and client-side JOIN execution for the Data Designer.
 */

// ── Types ──

export { bezierPath } from '@compounds/_shared/joinGeometry'

export interface JoinNode {
  id: string
  sourceId: string          // datasource id from datasources.ts
  x: number
  y: number
  selectedFields: string[]  // checked output fields
}

export interface JoinEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceField: string       // e.g. 'repo_id'
  targetField: string       // e.g. 'repo_id'
  joinType: 'inner' | 'left'
}

// ── Node dimensions ──

export const NODE_W = 280
export const NODE_H_BASE = 48    // header height
export const FIELD_H = 36        // per field row height
export const PORT_R = 4          // port circle radius

// ── Bezier path between two field ports ──

// ── Get port position (right side of source field, left side of target field) ──

export function getPortPos(
  node: JoinNode,
  fieldIndex: number,
  side: 'left' | 'right',
): { x: number; y: number } {
  const x = side === 'right' ? node.x + NODE_W : node.x
  const y = node.y + NODE_H_BASE + fieldIndex * FIELD_H + FIELD_H / 2
  return { x, y }
}

// ── Client-side JOIN ──

export function joinRows(
  leftRows: Record<string, unknown>[],
  rightRows: Record<string, unknown>[],
  leftKey: string,
  rightKey: string,
  joinType: 'inner' | 'left' = 'inner',
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  const rightIndex = new Map<string, Record<string, unknown>[]>()

  // Build index on right side for O(n+m) instead of O(n*m)
  for (const r of rightRows) {
    const key = String(r[rightKey] ?? '')
    if (!rightIndex.has(key)) rightIndex.set(key, [])
    rightIndex.get(key)!.push(r)
  }

  for (const l of leftRows) {
    const key = String(l[leftKey] ?? '')
    const matches = rightIndex.get(key)
    if (matches && matches.length > 0) {
      for (const r of matches) {
        result.push({ ...l, ...r })
      }
    } else if (joinType === 'left') {
      result.push({ ...l })
    }
  }

  return result
}

// ── Merge selected fields from multiple nodes ──

export function mergeSelectedFields(
  nodes: JoinNode[],
): string[] {
  const fields: string[] = []
  for (const node of nodes) {
    for (const f of node.selectedFields) {
      if (!fields.includes(f)) fields.push(f)
    }
  }
  return fields
}
