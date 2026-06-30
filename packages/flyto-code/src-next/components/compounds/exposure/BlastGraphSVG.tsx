import { useMemo, useState } from 'react'
import Tooltip from '@mui/material/Tooltip'
import type { BlastGraph, BlastGraphNode } from '@lib/engine'
import { SEVERITY_TONE } from '@lib/tokens/severity'

// BlastGraphSVG — radial-layout renderer for the BlastGraph payload.
// Center node = the alert. Non-center nodes are distributed on rings
// around the center, with the ring radius chosen by node type so the
// most-important context (file, repo) sits closest. Edges fan out as
// straight lines, coloured by `kind`.
//
// Pure SVG — no force-simulation library — because the dataset is
// small (≤ ~20 nodes per alert) and a radial layout looks crisper at
// the war-room density than a jittery physics solve. If we later need
// 100+ node graphs (org-level blast surfaces), drop in d3-force.

export interface BlastGraphSVGProps {
  graph: BlastGraph
  width?: number
  height?: number
}

export function BlastGraphSVG({ graph, width = 520, height = 360 }: BlastGraphSVGProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const positions = useMemo(() => layout(graph, width, height), [graph, width, height])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: 'var(--mantine-color-dark-7)', borderRadius: 8 }}
      role="img"
      aria-label={`Blast radius graph centred on ${graph.summary}`}
    >
      <defs>
        <marker
          id="bg-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mantine-color-dark-3)" />
        </marker>
      </defs>

      {/* Edges first so nodes draw on top */}
      {graph.edges.map((e, i) => {
        const from = positions.get(e.from)
        const to = positions.get(e.to)
        if (!from || !to) return null
        const stroke = edgeColor(e.kind)
        const isHighlighted = hoveredId === e.from || hoveredId === e.to
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={stroke}
            strokeOpacity={isHighlighted ? 0.95 : 0.55}
            strokeWidth={isHighlighted ? 2.2 : 1.4}
            strokeDasharray={e.kind === 'in-flow' ? '3 3' : undefined}
            markerEnd="url(#bg-arrow)"
          />
        )
      })}

      {/* Nodes */}
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)
        if (!p) return null
        const isCenter = n.id === graph.center_id
        const r = nodeRadius(n.type, isCenter)
        const fill = nodeFill(n)
        const stroke = nodeStroke(n)
        const isHovered = hoveredId === n.id
        const label = truncate(n.label, 28)
        return (
          <Tooltip
            key={n.id}
            title={tooltipFor(n)}
            placement="top"
            arrow
            slotProps={{ tooltip: { sx: { maxWidth: 260, whiteSpace: 'pre-line', fontSize: 13 } } }}
          >
            <g
              onMouseEnter={() => setHoveredId(n.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? r + 3 : r}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCenter ? 2.5 : 1.5}
                opacity={isHovered ? 1 : 0.95}
              />
              <text
                x={p.x}
                y={p.y + r + 12}
                textAnchor="middle"
                fontSize={isCenter ? 12 : 10}
                fill="var(--flyto-text-secondary, #94a3b8)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--flyto-surface-base, #0f172a)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {nodeBadge(n.type)}
              </text>
            </g>
          </Tooltip>
        )
      })}
    </svg>
  )
}

// ── layout ───────────────────────────────────────────────────────

function layout(graph: BlastGraph, width: number, height: number) {
  const positions = new Map<string, { x: number; y: number }>()
  const cx = width / 2
  const cy = height / 2

  // Center node at the centre.
  positions.set(graph.center_id, { x: cx, y: cy })

  // Group non-centre nodes by type so each cluster gets its own angle
  // arc. Order matters — most-connected types take the prime slots.
  const buckets = new Map<string, BlastGraphNode[]>()
  for (const n of graph.nodes) {
    if (n.id === graph.center_id) continue
    const key = n.type
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(n)
  }

  // Angle assignment: file at 12 o'clock, prs right, repo bottom, etc.
  const baseAngle: Record<string, number> = {
    file: -Math.PI / 2, // top
    pr: 0,              // right
    taint: Math.PI / 2 - Math.PI / 6, // lower-right
    repo: Math.PI / 2,  // bottom
    pentest: Math.PI - Math.PI / 6,   // lower-left
    autofix: -Math.PI / 2 + Math.PI / 6, // upper-right
  }

  for (const [type, list] of buckets) {
    const center = baseAngle[type] ?? Math.PI
    // Spread same-type nodes across a small arc so they don't overlap.
    const spread = Math.min(Math.PI / 3, (list.length - 1) * 0.3)
    const ring = ringRadius(type, width, height)
    list.forEach((n, i) => {
      const t = list.length === 1 ? 0 : i / (list.length - 1) - 0.5
      const angle = center + t * spread
      positions.set(n.id, {
        x: cx + ring * Math.cos(angle),
        y: cy + ring * Math.sin(angle),
      })
    })
  }
  return positions
}

function ringRadius(type: string, w = 520, h = 360): number {
  const base = Math.min(w, h) * 0.36
  // Bring the most important context closer; push less-actionable
  // signals (autofix hint) a hair further out.
  switch (type) {
    case 'file':    return base * 0.85
    case 'repo':    return base * 1.05
    case 'pr':      return base
    case 'taint':   return base * 0.95
    case 'pentest': return base * 1.1
    case 'autofix': return base * 1.15
  }
  return base
}

// ── styles ───────────────────────────────────────────────────────

function nodeRadius(type: string, isCenter: boolean): number {
  if (isCenter) return 22
  switch (type) {
    case 'file':    return 16
    case 'repo':    return 14
    case 'pr':      return 13
    case 'taint':   return 13
    case 'pentest': return 14
    case 'autofix': return 12
  }
  return 12
}

function nodeFill(n: BlastGraphNode): string {
  switch (n.severity) {
    case 'critical': return SEVERITY_TONE.critical.tone
    case 'high':     return SEVERITY_TONE.high.tone
    case 'medium':   return SEVERITY_TONE.medium.tone
    case 'low':      return SEVERITY_TONE.low.tone
    case 'info':     return '#94a3b8'
  }
  switch (n.type) {
    case 'alert':   return '#a78bfa'
    case 'file':    return '#22d3ee'
    case 'repo':    return '#6366f1'
    case 'pr':      return '#06b6d4'
    case 'taint':   return '#ef4444'
    case 'pentest': return '#fb923c'
    case 'autofix': return '#34d399'
  }
  return '#94a3b8'
}

function nodeStroke(n: BlastGraphNode): string {
  if (n.type === 'alert') return '#fff'
  return 'rgba(255,255,255,0.25)'
}

function nodeBadge(type: string): string {
  switch (type) {
    case 'alert':   return 'A'
    case 'file':    return 'F'
    case 'repo':    return 'R'
    case 'pr':      return 'PR'
    case 'taint':   return 'T'
    case 'pentest': return 'PT'
    case 'autofix': return 'FX'
  }
  return '?'
}

function edgeColor(kind: string): string {
  switch (kind) {
    case 'affects':  return '#a78bfa'
    case 'in-repo':  return '#6366f1'
    case 'edits':    return '#06b6d4'
    case 'in-flow':  return '#ef4444'
    case 'verifies': return '#fb923c'
    case 'fixes':    return '#34d399'
  }
  return '#475569'
}

function tooltipFor(n: BlastGraphNode): string {
  const parts: string[] = []
  parts.push(`${n.type.toUpperCase()} — ${n.label}`)
  if (n.severity) parts.push(`Severity: ${n.severity}`)
  if (n.data) {
    for (const [k, v] of Object.entries(n.data)) {
      if (v == null || v === '') continue
      if (typeof v === 'object') continue
      parts.push(`${k}: ${String(v)}`)
    }
  }
  return parts.join('\n')
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
