/**
 * EdgeLine — single 3D Bezier-curved edge between two nodes.
 *
 * Extracted from FootprintGraphView.tsx Phase 5. Dashed variant for
 * indicator / uses-vendor relationships (visual cue: "context, not
 * an attack hop"). Line thickness derived from confidence.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { curvedPoints } from './layout'

export interface EdgeLineProps {
  from: THREE.Vector3
  to: THREE.Vector3
  highlighted?: boolean
  color: string
  highlightColor: string
  /** 0..1 — drives line thickness so strong evidence reads thick. */
  strength?: number
  /** Dashed variant — used for "uses-vendor / indicator" edges so
   *  they're visually distinct from solid attack-chain edges. */
  dashed?: boolean
  /** Focus mode — when an entity is selected, non-highlighted edges
   *  drop to ~10% opacity so the neighbourhood reads cleanly even
   *  in a dense graph. Off (default) = the old all-edges-visible
   *  treatment. Operator design 2026-05-23 Codex #3. */
  focusMode?: boolean
  /** Animate a flowing dash along the edge — used for the selected
   *  discovery chain so the path the operator picked reads as live
   *  "energy flow" from seed → target rather than a static line. */
  animated?: boolean
}

// drei's <Line> forwards its ref to the underlying Line2 whose material is
// a LineMaterial carrying `dashOffset` — narrow shape we animate each frame.
interface AnimatableLine { material?: { dashOffset?: number } }

export function EdgeLine({
  from, to, highlighted, color, highlightColor, strength = 0.7, dashed = false, focusMode = false, animated = false,
}: EdgeLineProps) {
  const pts = useMemo(() => curvedPoints(from, to), [from, to])
  const lineRef = useRef<AnimatableLine | null>(null)
  useFrame((_, delta) => {
    const mat = lineRef.current?.material
    if (animated && mat && typeof mat.dashOffset === 'number') {
      // Negative offset → dashes travel from `from` toward `to`
      // (seed → discovered asset), reading as discovery flow.
      mat.dashOffset -= delta * 0.8
    }
  })
  const baseWidth = dashed
    ? 0.6
    : strength >= 0.9 ? 2.0 : strength >= 0.7 ? 1.4 : strength >= 0.5 ? 1.0 : 0.7
  // Opacity ladder:
  //   focusMode && !highlighted → 0.08 (almost invisible — "context only")
  //   highlighted               → 0.95 (the operator's neighbourhood)
  //   dashed                    → 0.40 (indicator edges — context)
  //   default                   → 0.35 + 0.35*strength
  let opacity = 0.35 + 0.35 * Math.min(strength, 1)
  if (dashed) opacity = 0.4
  if (highlighted) opacity = 0.95
  else if (focusMode) opacity = 0.08
  // Animated (selected-chain) edges render as a flowing dash; indicator
  // edges keep their static dash; everything else stays solid.
  const drawDashed = dashed || animated
  return (
    <Line
      ref={lineRef as never}
      points={pts}
      color={highlighted ? highlightColor : color}
      lineWidth={highlighted ? 2.6 : baseWidth}
      transparent
      opacity={opacity}
      dashed={drawDashed}
      dashSize={animated ? 0.32 : dashed ? 0.18 : undefined}
      gapSize={animated ? 0.18 : dashed ? 0.12 : undefined}
    />
  )
}
