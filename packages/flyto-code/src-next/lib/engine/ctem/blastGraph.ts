// blastGraph.ts — Cross-dim radial blast-radius graph for a single alert.
//
// Backend: GET /api/v1/code/alerts/{id}/blast-graph
//
// The graph centers on the alert and fans out to PRs touching the same
// file, taint flows the finding sits in, autofix patches, and pentest
// verdicts on the linked repo. Frontend renders via BlastGraphSVG with
// a radial layout — the visual is the explainability of why a given
// blast_radius score landed where it did.

import { request } from '../client'

export type BlastGraphNodeType =
  | 'alert'
  | 'repo'
  | 'file'
  | 'pr'
  | 'taint'
  | 'pentest'
  | 'autofix'

export type BlastGraphEdgeKind =
  | 'affects'
  | 'in-repo'
  | 'edits'
  | 'in-flow'
  | 'verifies'
  | 'fixes'

export interface BlastGraphNode {
  id: string
  type: BlastGraphNodeType
  label: string
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  data?: Record<string, unknown>
}

export interface BlastGraphEdge {
  from: string
  to: string
  kind: BlastGraphEdgeKind
}

export interface BlastGraph {
  alert_id: string
  center_id: string
  blast_radius: number
  summary: string
  nodes: BlastGraphNode[]
  edges: BlastGraphEdge[]
}

export function getBlastGraph(alertId: string) {
  return request<BlastGraph>('GET', `/api/v1/code/alerts/${alertId}/blast-graph`)
}
