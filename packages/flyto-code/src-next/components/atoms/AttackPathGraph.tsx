import { useMemo } from 'react'
import { colors, softBg } from '@/styles/designTokens'

// AttackPathGraph — tiny SVG visualization of an attack chain.
// Three node types laid out left-to-right:
//
//   asset (entry)  →  finding  →  finding  →  asset (impact)
//
// Pure SVG (no react-flow / cytoscape dependency) — the graph for
// any single path is < 6 nodes, so a hand-rolled layout is cheaper
// + we don't ship 100KB of force-direct code.
//
// Layout: nodes evenly distributed on a horizontal axis, arrows
// connecting them with a slight Bézier curve so overlapping
// arrowheads stay legible.

export type GraphNodeKind = 'asset_entry' | 'finding' | 'asset_impact'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Severity colour for finding nodes. Asset nodes ignore this. */
  severity?: 'critical' | 'high' | 'medium' | 'low'
}

export interface AttackPathGraphProps {
  nodes: GraphNode[]
  /** Optional click handler — passes node.id back. */
  onNodeClick?: (id: string) => void
  /** Pixel height; width auto-stretches. Defaults to compact 120. */
  height?: number
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 38
const ASSET_R = 18

export function AttackPathGraph({ nodes, onNodeClick, height = 130 }: AttackPathGraphProps) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return { width: 0, positions: [] as Array<{ x: number; y: number; n: GraphNode }> }
    const padding = 24
    const cellW = NODE_WIDTH + 60
    const width = padding * 2 + cellW * Math.max(1, nodes.length - 1) + NODE_WIDTH
    const y = height / 2
    const positions = nodes.map((n, i) => ({
      x: padding + i * cellW + NODE_WIDTH / 2,
      y,
      n,
    }))
    return { width, positions }
  }, [nodes, height])

  if (nodes.length === 0) return null

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${height}`}
      width="100%"
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Attack chain: ${nodes.map(n => n.label).join(' → ')}`}
    >
      <defs>
        <marker id="apg-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={colors.semantic.neutral} />
        </marker>
      </defs>

      {/* Edges drawn first so nodes paint on top. */}
      {layout.positions.slice(0, -1).map((p, i) => {
        const next = layout.positions[i + 1]
        const x1 = p.x + (p.n.kind === 'finding' ? NODE_WIDTH / 2 : ASSET_R)
        const x2 = next.x - (next.n.kind === 'finding' ? NODE_WIDTH / 2 : ASSET_R)
        const midX = (x1 + x2) / 2
        const d = `M ${x1} ${p.y} C ${midX} ${p.y}, ${midX} ${next.y}, ${x2} ${next.y}`
        return (
          <path
            key={`e-${i}`}
            d={d}
            fill="none"
            stroke={colors.semantic.neutral}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            markerEnd="url(#apg-arrow)"
            opacity={0.7}
          />
        )
      })}

      {/* Nodes — assets are circles, findings are pills with the
          severity tint so the eye instantly groups "all the
          critical findings in this chain". */}
      {layout.positions.map(({ x, y, n }) => {
        const isAsset = n.kind !== 'finding'
        const tone = n.severity
          ? colors.severity[n.severity]
          : isAsset
            ? (n.kind === 'asset_entry' ? colors.tech : colors.severity.critical)
            : colors.semantic.neutral
        const clickable = !!onNodeClick
        return (
          <g
            key={n.id}
            onClick={clickable ? () => onNodeClick!(n.id) : undefined}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
          >
            {isAsset ? (
              <circle
                cx={x}
                cy={y}
                r={ASSET_R}
                fill={softBg(tone, 0.18)}
                stroke={tone}
                strokeWidth={1.5}
              />
            ) : (
              <rect
                x={x - NODE_WIDTH / 2}
                y={y - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={NODE_HEIGHT / 2}
                fill={softBg(tone, 0.20)}
                stroke={tone}
                strokeWidth={1.5}
              />
            )}
            <text
              x={x}
              y={y + (isAsset ? ASSET_R + 14 : 4)}
              textAnchor="middle"
              fontSize={isAsset ? 10 : 11}
              fontWeight={isAsset ? 600 : 700}
              fill={isAsset ? 'var(--mui-palette-text-secondary, #94a3b8)' : tone}
              style={{ pointerEvents: 'none' }}
            >
              {truncate(n.label, isAsset ? 18 : 22)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
