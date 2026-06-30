/**
 * AssetCity3D — every monitored asset as a cyberpunk city.
 *
 * Each connected repo OR monitored domain becomes a building. The
 * metaphor is supposed to do all the talking before the operator
 * reads a single label:
 *   - cube buildings         = repos (code district)
 *   - cylindrical towers     = domains (external district)
 *   - building height        = log-scale of activity volume
 *                              (alerts + findings for repos,
 *                              assets + issues for domains)
 *   - building tone          = grade colour (A green → F red)
 *   - pulsing red beacon top = open critical findings
 *   - solid colour, no beacon = healthy
 *   - building width / depth = effectively one block — the city
 *     reads as a uniform grid so the eye picks up height + colour
 *     differences instantly.
 *
 * The mixed cube + cylinder layout lets external-only orgs see a
 * city full of towers without the row going empty, and combined
 * orgs naturally get two visual districts side by side.
 *
 * The ground plane is a dark Tron-style grid; subtle fog gives depth.
 * Camera auto-orbits slowly, with a low polar clamp so the operator
 * always sees the city from a mid-angle (never looking straight down,
 * never lying on the ground plane).
 *
 * Click a building → navigate into that repo's detail page.
 *
 * Why this beats a 3D bar chart of categories:
 *   - It maps directly to physical objects the operator already
 *     reasons about ("which repo is the worst?").
 *   - Skylines have an implicit story: tall + red = "that's the
 *     skyscraper that's on fire", and you can see it across the
 *     room. Bars are abstract.
 *   - The grid layout scales naturally to dozens of repos without
 *     overflow or label collision.
 *
 * Labels: there are none on the 3D objects themselves to avoid
 * Troika web-worker / CSP issues. Hovering a building pops an HTML
 * tooltip via drei's <Html/> instead.
 */

import { t } from '@lib/i18n';
import { useMemo, useRef, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { useTheme } from '@mui/material/styles'
import * as THREE from 'three'

export interface AssetCity3DProps {
  buildings: CityBuilding[]
  /** Click a building. The caller dispatches based on `kind`:
   *  `repo` → repo detail page, `domain` → domain detail page. */
  onBuildingClick?: (building: CityBuilding) => void
}

export interface CityBuilding {
  /** Stable id — repoId for code buildings, domain string for
   *  external buildings. Used as React key + click payload. */
  id: string
  /** What category (surface) the building belongs to. Drives the shape,
   *  the district it lands in, and the click-through destination.
   *  Extend the union + the DISTRICTS table to add a new pillar. */
  kind: 'repo' | 'domain' | 'cloud'
  name: string
  /** 0 - 100 raw score. */
  score: number
  /** A / B / C / D / F. */
  grade: string
  /** Drives height. Pass any positive metric; we log-scale
   *  internally so a 100k-LOC repo isn't 1000× a 100-LOC one. */
  size: number
  /** Number of open critical / high findings. Drives the pulsing
   *  beacon on top of the building. 0 = no beacon. */
  criticalCount: number
}

function gradeTone(grade: string): string {
  switch (grade?.toUpperCase()?.[0]) {
    case 'A': return '#22c55e'
    case 'B': return '#84cc16'
    case 'C': return '#eab308'
    case 'D': return '#f97316'
    case 'F': return '#ef4444'
    default:  return '#64748b'
  }
}

export function AssetCity3D({ buildings, onBuildingClick }: AssetCity3DProps) {
  // Theme-aware backdrop. The previous build used a hard-coded
  // `#050715` cyberpunk-dark bg which looked like a hole punched
  // through the page in light mode. We now pick a palette per mode:
  //   light → soft slate so buildings + grid stay legible without
  //           blowing out the rest of the dashboard
  //   dark  → original deep-space tone for the cyberpunk vibe
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const bgColor = isDark ? '#050715' : '#eef2f8'
  const fogColor = bgColor
  const gridColor = isDark ? '#1d4ed8' : '#7c3aed'
  const gridOpacity = isDark ? 0.35 : 0.22
  const ambientIntensity = isDark ? 0.35 : 0.85
  const fillIntensity = isDark ? 0.55 : 0.25
  const accentIntensity = isDark ? 0.4 : 0.18
  const planeColor = isDark ? '#0b0f1f' : '#f3f4fa'

  if (buildings.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: isDark ? '#94a3b8' : '#64748b', fontSize: 13,
      }}>
        {t('dashboard.cityEmpty')}
      </div>
    )
  }
  // Pull the camera back as more districts appear so the full city +
  // the buffers between districts stay in frame on first paint.
  // Single-district orgs keep the original tight zoom; each extra
  // district widens the city, so step the camera out per district.
  const districtCount = new Set(buildings.map(b => b.kind)).size
  const cameraPos: [number, number, number] =
    districtCount >= 3 ? [18, 13, 22]
    : districtCount === 2 ? [14, 11, 18]
    : [10, 9, 14]

  return (
    <Canvas
      camera={{ position: cameraPos, fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[fogColor, 18, 38]} />
        <ambientLight intensity={ambientIntensity} />
        <directionalLight position={[8, 14, 6]} intensity={0.85} color={isDark ? '#c4b5fd' : '#ffffff'} />
        <pointLight position={[-10, 6, -10]} intensity={fillIntensity} color="#06b6d4" />
        <pointLight position={[10, 4, 10]} intensity={accentIntensity} color="#ec4899" />
        <City
          buildings={buildings}
          onBuildingClick={onBuildingClick}
          gridColor={gridColor}
          gridOpacity={gridOpacity}
          planeColor={planeColor}
          isDark={isDark}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.55}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Suspense>
    </Canvas>
  )
}

// Lay buildings out on a square-ish grid recentred on the origin.
// Returns positions in *district-local* coordinates — the caller
// translates the whole grid by the district's offset so the two
// districts (code / external) sit side by side in world space.
function gridLayout(count: number): Array<[number, number]> {
  const side = Math.ceil(Math.sqrt(count))
  const cells: Array<[number, number]> = []
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (cells.length < count) cells.push([x, y])
    }
  }
  const offset = (side - 1) / 2
  return cells.map(([x, y]) => [x - offset, y - offset])
}

// Canonical district order + label per building kind. Adding a pillar to
// the city = one entry here (+ extend CityBuilding['kind'] + a shapeFor()
// case). No per-pair layout special-casing anywhere else.
const DISTRICTS: Array<{ kind: CityBuilding['kind']; label: string }> = [
  { kind: 'repo', label: 'CODE' },
  { kind: 'domain', label: 'EXTERNAL' },
  { kind: 'cloud', label: 'CLOUD' },
]

function City({ buildings, onBuildingClick, gridColor, gridOpacity, planeColor, isDark }: {
  buildings: CityBuilding[]
  onBuildingClick?: (building: CityBuilding) => void
  gridColor: string
  gridOpacity: number
  planeColor: string
  isDark: boolean
}) {
  const cellSize = 1.6
  const districtGap = 3.5  // empty buffer on the x axis between districts

  // Shared height scale across every district so a tall building in one
  // surface reads taller than a short one in another (independent scales
  // would mislead the eye).
  const allSizes = useMemo(() => buildings.map(b => Math.max(1, b.size)), [buildings])
  const maxLog = allSizes.length > 0 ? Math.log(Math.max(...allSizes) + 1) : 1
  const minLog = allSizes.length > 0 ? Math.log(Math.min(...allSizes) + 1) : 0
  const span = Math.max(0.01, maxLog - minLog)
  const heightFor = (size: number) => {
    const norm = (Math.log(Math.max(1, size) + 1) - minLog) / span
    return 0.8 + norm * 4.7
  }

  // One district per present kind, in canonical order. Each lays its
  // buildings on a square grid sorted by criticality; the districts are
  // then placed left→right and centred on the origin. N-surface: a new
  // pillar just shows up as another district — no layout special-casing.
  const { districts, totalWidth } = useMemo(() => {
    const present = DISTRICTS
      .map(d => {
        const items = buildings
          .filter(b => b.kind === d.kind)
          .sort((a, b) => (b.criticalCount * 1000 + b.size) - (a.criticalCount * 1000 + a.size))
        const side = Math.ceil(Math.sqrt(Math.max(1, items.length)))
        return { ...d, items, layout: gridLayout(items.length), halfWidth: (side * cellSize) / 2 }
      })
      .filter(d => d.items.length > 0)

    const width = present.reduce((s, d) => s + d.halfWidth * 2, 0)
      + districtGap * Math.max(0, present.length - 1)
    let cursor = -width / 2
    let start = 0
    const out = present.map(d => {
      const offsetX = cursor + d.halfWidth
      cursor += d.halfWidth * 2 + districtGap
      const withMeta = { ...d, offsetX, startIndex: start }
      start += d.items.length
      return withMeta
    })
    return { districts: out, totalWidth: width }
  }, [buildings])

  const planeExtent = Math.max(10, totalWidth / 2 + 6)
  const multiDistrict = districts.length > 1

  return (
    <group>
      <GroundGrid
        extent={planeExtent}
        gridColor={gridColor}
        gridOpacity={gridOpacity}
        planeColor={planeColor}
      />

      {districts.map(d => (
        <group key={d.kind}>
          {/* District label — only when more than one district is present,
              floating above the centre of its grid. */}
          {multiDistrict && (
            <DistrictLabel
              position={[d.offsetX, 5.5, 0]}
              label={d.label}
              count={d.items.length}
              isDark={isDark}
            />
          )}
          {d.items.map((b, i) => {
            const [gx, gy] = d.layout[i] ?? [0, 0]
            return (
              <Building
                key={b.id}
                building={b}
                x={d.offsetX + gx * cellSize}
                z={gy * cellSize}
                height={heightFor(b.size)}
                mountDelay={(d.startIndex + i) * 0.05}
                isDark={isDark}
                onClick={onBuildingClick ? () => onBuildingClick(b) : undefined}
              />
            )
          })}
        </group>
      ))}
    </group>
  )
}

// DistrictLabel — floating "CODE" / "EXTERNAL" tag rendered via
// drei's <Html/> so it follows the district position during camera
// orbit. Drawn above the tallest building so it doesn't get hidden
// by skyscrapers in the foreground.
function DistrictLabel({ position, label, count, isDark }: {
  position: [number, number, number]
  label: string
  count: number
  isDark: boolean
}) {
  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div style={{
        background: isDark ? 'rgba(15,23,42,0.7)' : 'rgba(241,245,249,0.85)',
        border: `1px solid ${isDark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.4)'}`,
        borderRadius: 4,
        padding: '3px 10px',
        color: isDark ? '#cbd5e1' : '#475569',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        textShadow: isDark ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
      }}>
        {label}
        <span style={{
          marginLeft: 6,
          color: isDark ? 'rgba(203,213,225,0.55)' : 'rgba(71,85,105,0.6)',
        }}>
          {count}
        </span>
      </div>
    </Html>
  )
}

function GroundGrid({ extent, gridColor, gridOpacity, planeColor }: {
  extent: number
  gridColor: string
  gridOpacity: number
  planeColor: string
}) {
  // A Tron-style grid: base plane + two perpendicular sets of glowing
  // lines. Lines drawn as thin elongated boxes (no shader sorcery)
  // so it stays performant. Colours are theme-aware so light mode
  // doesn't render as a black hole in the page.
  const lineCount = Math.floor(extent)
  const linesX: number[] = []
  const linesZ: number[] = []
  for (let i = -lineCount; i <= lineCount; i++) linesX.push(i)
  for (let i = -lineCount; i <= lineCount; i++) linesZ.push(i)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[extent * 2 + 4, extent * 2 + 4]} />
        <meshStandardMaterial color={planeColor} roughness={1} metalness={0.2} />
      </mesh>
      {linesX.map((i) => (
        <mesh key={`x${i}`} position={[i, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, extent * 2 + 2]} />
          <meshBasicMaterial color={gridColor} transparent opacity={gridOpacity} />
        </mesh>
      ))}
      {linesZ.map((i) => (
        <mesh key={`z${i}`} position={[0, 0, i]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[0.02, extent * 2 + 2]} />
          <meshBasicMaterial color={gridColor} transparent opacity={gridOpacity} />
        </mesh>
      ))}
    </group>
  )
}

function Building({ building, x, z, height, mountDelay, isDark, onClick }: {
  building: CityBuilding
  x: number
  z: number
  height: number
  mountDelay: number
  isDark: boolean
  onClick?: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const beaconRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)
  const tone = gradeTone(building.grade)
  const hasCritical = building.criticalCount > 0
  const isInteractive = !!onClick

  useFrame((state) => {
    if (!meshRef.current) return
    // Mount-in spring: building grows from the ground in a
    // staggered wave. `mountDelay` per-building creates a
    // skyline-rises-out-of-the-fog effect on first paint.
    const t = state.clock.getElapsedTime() - mountDelay
    if (t < 0) {
      meshRef.current.scale.y = 0.001
      meshRef.current.position.y = 0
    } else {
      const p = Math.min(t / 0.95, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const scaleY = Math.max(0.001, eased)
      meshRef.current.scale.y = scaleY
      meshRef.current.scale.x = hovered ? 1.05 : 1
      meshRef.current.scale.z = hovered ? 1.05 : 1
      meshRef.current.position.y = (height * scaleY) / 2
    }
    // Critical beacon pulses with sin(time). The beacon's emissive
    // intensity ramps with hover so the operator gets visual
    // feedback that "yes that pin is the one you're aiming at".
    if (beaconRef.current && hasCritical) {
      const pulse = 0.6 + Math.sin(state.clock.getElapsedTime() * 3.5) * 0.4
      const mat = beaconRef.current.material as THREE.MeshStandardMaterial
      if (mat) mat.emissiveIntensity = pulse + (hovered ? 0.6 : 0)
      beaconRef.current.position.y = height + 0.4 + Math.sin(state.clock.getElapsedTime() * 3.5) * 0.05
    }
  })

  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = isInteractive ? 'pointer' : 'default' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
      >
        {/* Repos = cubic block buildings, domains = cylindrical
            towers. Visual distinction lets the operator tell
            "code district" from "external district" at a glance,
            even when both are mixed in the same skyline. */}
        {building.kind === 'domain'
          ? <cylinderGeometry args={[0.45, 0.45, height, 24]} />
          : building.kind === 'cloud'
            ? <coneGeometry args={[0.62, height, 4]} />
            : <boxGeometry args={[0.95, height, 0.95]} />}
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          // Light mode buildings look washed out with the same
          // emissive intensity tuned for the dark scene; bias it
          // lower so they read as solid coloured blocks instead of
          // bright neon. Dark mode keeps the original glow.
          emissiveIntensity={
            isDark
              ? (hasCritical ? 0.35 : 0.18)
              : (hasCritical ? 0.12 : 0.04)
          }
          roughness={isDark ? 0.6 : 0.55}
          metalness={isDark ? 0.25 : 0.12}
        />
      </mesh>

      {/* Critical beacon — a glowing sphere floating above the
          building. Only renders for repos that have open critical
          findings, so a healthy city stays clean. */}
      {hasCritical && (
        <mesh ref={beaconRef} position={[0, height + 0.4, 0]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.9}
            transparent
            opacity={0.95}
            roughness={0.3}
          />
        </mesh>
      )}

      {/* Tooltip — only when hovered. Plain DOM via drei <Html>;
          no Troika worker, no CSP friction. */}
      {hovered && (
        <Html position={[0, height + 0.85, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(15,23,42,0.92)',
            border: `1px solid ${tone}`,
            padding: '6px 10px',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            userSelect: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fff' }}>
              <span style={{
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
                opacity: 0.5, fontWeight: 700,
              }}>
                {building.kind}
              </span>
              <span>{building.name}</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ color: tone }}>
                {building.grade} · {building.score}
              </span>
              {hasCritical && (
                <span style={{ color: '#ef4444', marginLeft: 8 }}>
                  · {building.criticalCount} critical
                </span>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
