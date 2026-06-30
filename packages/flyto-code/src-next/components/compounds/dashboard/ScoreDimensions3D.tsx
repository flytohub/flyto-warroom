/**
 * ScoreDimensions3D — full-width animated 3D bar chart of scoring categories.
 *
 * Replaced the previous CrossDimNetwork3D orbital scene (operator
 * feedback: "3D 動畫有點沒意義") with a visualisation that actually
 * shows useful data: each scoring category as a 3D bar, height
 * proportional to its raw score (0-100), tinted by grade tone.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │   ▮      ▯      ▭      ▮       ▮       ▯                   │
 *   │  82     54     61     75      88      45                    │
 *   │ Attack   Code   Code  Diligence Cred  Reach                 │
 *   │ Surface  Sec   Qual            Expo                         │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Bars grow from 0 → target height on mount (spring animation),
 * the camera slowly orbits the scene, and hover/click on a bar
 * pops the category label + score in a tooltip overlay. Click
 * a bar to drill into the Scoring section for that category.
 *
 * Why this is meaningful (vs. the orbital scene):
 *   - Heights map to a real number every operator already
 *     internalises ("the score").
 *   - Colours match the grade tones used everywhere else in the
 *     app — no new visual vocabulary to learn.
 *   - Comparing two bars at a glance answers "which dimension is
 *     pulling my score down". The orbital network could not.
 */

import { t } from '@lib/i18n';
import { useMemo, useRef, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { ComputedCategoryServer } from '@lib/engine'

// We used to render labels with drei's <Text/>. That component
// delegates to Troika 3D Text, which spawns a web worker via a
// blob: URL to typeset fonts off the main thread. In production
// that worker creation is blocked by the war-room CSP (which
// scopes script-src and falls back to it for worker-src). The
// CSP rejection cascades into "WebGLRenderer: Context Lost" the
// next frame and the whole canvas goes blank.
//
// drei's <Html/> portals plain DOM children into the parent canvas
// at a tracked 3D position — no worker, no CSP issue, and the
// labels also pick up the app's font/colour tokens automatically.

export interface ScoreDimensions3DProps {
  categories: ComputedCategoryServer[]
  /** Click a bar → navigate into the Scoring section. */
  onCategoryClick?: (categoryId: string) => void
}

// Map a 0-100 raw score onto a grade-style tone gradient: red →
// orange → yellow → lime → green. Identical bands to the dashboard
// Gauge / RiskBars so the operator's "what's a B colour" muscle
// memory carries over.
function scoreTone(score: number): string {
  if (score >= 85) return '#22c55e'  // A
  if (score >= 70) return '#84cc16'  // B
  if (score >= 55) return '#eab308'  // C
  if (score >= 40) return '#f97316'  // D
  return '#ef4444'                   // F
}

export function ScoreDimensions3D({ categories, onCategoryClick }: ScoreDimensions3DProps) {
  // A3-F4 (2026-05-25). Per-category gate: a missing raw or grade
  // means the engine didn't compute this dimension yet (mode
  // mismatch, surface_disabled, bootstrap). Pre-A3 the map step did
  //   score: Math.round(c.raw ?? 0)
  //   grade: c.grade ?? '-'
  //   tone:  scoreTone(c.raw ?? 0)
  // — three fallbacks that LOOKED like dead code after the
  // `c.raw != null` filter but were live for grade and were the
  // exact "fake F bar at score 0" pattern A3 was supposed to
  // eliminate (if a future edit relaxed the filter without
  // checking the map, an unscored category would render as a red
  // 0 bar with a '-' grade label — visually a real catastrophic
  // dimension collapse).
  //
  // Tightening the filter to require BOTH raw AND grade non-null,
  // and using a type predicate so TS narrows inside .map, lets the
  // mapping step drop the fallback noise entirely. If raw and
  // grade ever drift apart on the wire, the affected category
  // just disappears from the scene instead of rendering a half-
  // grade ghost — which is the operator's "no weird empty-state
  // shapes" rule applied per-bar.
  const bars = useMemo(() => {
    return categories
      .filter((c): c is ComputedCategoryServer & { raw: number; grade: string } =>
        c.raw != null && c.raw >= 0 && c.grade != null && c.grade !== '',
      )
      .map((c) => ({
        id: c.id,
        label: c.label,
        score: Math.round(c.raw),
        grade: c.grade,
        tone: scoreTone(c.raw),
        weight: c.effective_weight ?? c.weight,
      }))
  }, [categories])

  if (bars.length === 0) {
    // Existing empty-state copy is the "correct" no-3D-ghost
    // affordance per operator's reminder — plain centered DOM
    // text in the same container, no half-rendered scene, no
    // floating axis lines. Keeping as-is so the bar-count=0
    // case (whether genuinely no categories OR all-categories-
    // filtered-out for no-score) lands the same place.
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#94a3b8', fontSize: 13,
      }}>
        {t('dashboard.dimensionsEmpty')}
      </div>
    )
  }

  return (
    <Canvas
      camera={{ position: [0, 5, 11], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 8, 6]} intensity={0.9} color="#ffffff" />
        <pointLight position={[-6, 4, 4]} intensity={0.4} color="#a78bfa" />
        <Scene bars={bars} onCategoryClick={onCategoryClick} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.45}
          minPolarAngle={Math.PI / 3.6}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Suspense>
    </Canvas>
  )
}

interface Bar {
  id: string
  label: string
  score: number
  grade: string
  tone: string
  weight: number
}

function Scene({ bars, onCategoryClick }: {
  bars: Bar[]
  onCategoryClick?: (categoryId: string) => void
}) {
  const totalWidth = bars.length * 1.4
  const startX = -totalWidth / 2 + 0.7

  return (
    <group>
      {/* Floor disc — subtle ground plane so the bars feel like
          they're standing on something, not floating. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[totalWidth * 0.65, 64]} />
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.06}
          roughness={1}
        />
      </mesh>

      {/* Grid lines at score 25 / 50 / 75 — subtle reference marks
          so the bar heights are readable without a number above. */}
      {[25, 50, 75].map(level => {
        const h = (level / 100) * 4.5
        return (
          <mesh key={level} position={[0, h, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[totalWidth * 0.55, totalWidth * 0.555, 64]} />
            <meshBasicMaterial color="#94a3b8" transparent opacity={0.12} />
          </mesh>
        )
      })}

      {bars.map((bar, i) => (
        <CategoryBar
          key={bar.id}
          bar={bar}
          xPosition={startX + i * 1.4}
          delay={i * 0.08}
          onClick={onCategoryClick ? () => onCategoryClick(bar.id) : undefined}
        />
      ))}
    </group>
  )
}

function CategoryBar({ bar, xPosition, delay, onClick }: {
  bar: Bar
  xPosition: number
  delay: number
  onClick?: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)
  const targetHeight = (bar.score / 100) * 4.5  // 100 score → 4.5 units tall
  const animProgressRef = useRef(0)

  useFrame((state, dt) => {
    if (!meshRef.current) return
    // Spring-like grow animation on mount. After `delay` seconds
    // have elapsed, ramp animProgress from 0 → 1 over ~0.8s with
    // a touch of overshoot. tracked in a ref so React doesn't
    // re-render every frame.
    const t = state.clock.getElapsedTime() - delay
    if (t < 0) {
      meshRef.current.scale.y = 0.001
      meshRef.current.position.y = 0
      return
    }
    const p = Math.min(t / 0.85, 1)
    // Spring overshoot via simple sine-decay; max overshoot ~6%.
    const easedSpring = 1 - Math.pow(1 - p, 3) + (p < 1 ? Math.sin(p * Math.PI * 2.5) * 0.06 * (1 - p) : 0)
    animProgressRef.current = easedSpring
    const scaleY = Math.max(0.001, easedSpring)
    meshRef.current.scale.y = scaleY
    meshRef.current.scale.x = hovered ? 1.12 : 1
    meshRef.current.scale.z = hovered ? 1.12 : 1
    meshRef.current.position.y = (targetHeight * scaleY) / 2
    void dt
  })

  // Truncate long labels so the 3D Text doesn't overflow into the
  // neighbour. drei's <Text/> doesn't auto-wrap, so we cap manually.
  const shortLabel = bar.label.length > 14 ? `${bar.label.slice(0, 12)}…` : bar.label

  return (
    <group position={[xPosition, 0, 0]}>
      {/* The bar — grows from 0 height in useFrame above. */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = onClick ? 'pointer' : 'default' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
        castShadow
      >
        <boxGeometry args={[0.85, targetHeight, 0.85]} />
        <meshStandardMaterial
          color={bar.tone}
          emissive={bar.tone}
          emissiveIntensity={hovered ? 0.6 : 0.28}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>

      {/* Score + grade — HTML overlay tracked to the top of the
          bar. The transform property keeps the label horizontally
          centred (-50% x) above the bar so it doesn't overlap. */}
      <Html
        position={[0, targetHeight + 0.55, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          textAlign: 'center',
          lineHeight: 1.1,
          textShadow: '0 1px 3px rgba(15,23,42,0.6)',
          userSelect: 'none',
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#e2e8f0',
            marginBottom: 1,
          }}>
            {bar.grade}
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: bar.tone,
          }}>
            {bar.score}
          </div>
        </div>
      </Html>

      {/* Category label below the bar. */}
      <Html
        position={[0, -0.55, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#cbd5e1',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(15,23,42,0.6)',
          userSelect: 'none',
        }}>
          {shortLabel}
        </div>
      </Html>
    </group>
  )
}
