import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTheme } from '@mui/material/styles'
import * as THREE from 'three'
import { colors } from '@/styles/designTokens'
import { t } from '@lib/i18n'

export type HumanSignalTone = 'danger' | 'warning' | 'success' | 'tech' | 'brand' | 'neutral'

export interface HumanPostureSignal {
  id: 'identity' | 'code' | 'external' | 'runtime' | 'cloud' | 'workflow'
  label: string
  value: string
  tone: HumanSignalTone
  intensity: number
}

interface HumanPosture3DProps {
  signals: HumanPostureSignal[]
}

type AnatomyPalette = {
  shell: string
  shellRim: string
  bone: string
  heart: string
  lung: string
  artery: string
  vein: string
  nerve: string
  shield: string
  tech: string
  floor: string
  floorLine: string
}

type AnatomyPathKind = 'artery' | 'vein' | 'nerve'

interface AnatomyPathSpec {
  id: string
  kind: AnatomyPathKind
  radius: number
  opacity: number
  points: Array<[number, number, number]>
}

const anatomySignalPositions: Record<HumanPostureSignal['id'], [number, number, number]> = {
  identity: [0, 1.76, 0.42],
  cloud: [-0.26, 0.88, 0.42],
  code: [-0.82, 0.1, 0.38],
  external: [0.82, 0.1, 0.38],
  runtime: [0, -0.52, 0.4],
  workflow: [0.24, 0.24, 0.42],
}

const vascularPaths: AnatomyPathSpec[] = [
  {
    id: 'aorta-head',
    kind: 'artery',
    radius: 0.018,
    opacity: 0.86,
    points: [[0.04, 0.82, 0.24], [0.02, 1.08, 0.22], [0, 1.34, 0.18], [0, 1.62, 0.16]],
  },
  {
    id: 'aorta-core',
    kind: 'artery',
    radius: 0.022,
    opacity: 0.92,
    points: [[0.02, 0.76, 0.26], [0, 0.38, 0.24], [0, -0.08, 0.2], [-0.08, -0.54, 0.16], [-0.2, -1.02, 0.1]],
  },
  {
    id: 'aorta-leg-right',
    kind: 'artery',
    radius: 0.015,
    opacity: 0.72,
    points: [[0, -0.5, 0.16], [0.2, -0.92, 0.12], [0.26, -1.35, 0.08], [0.24, -1.7, 0.1]],
  },
  {
    id: 'aorta-arm-left',
    kind: 'artery',
    radius: 0.014,
    opacity: 0.72,
    points: [[-0.16, 0.92, 0.22], [-0.48, 0.74, 0.2], [-0.72, 0.28, 0.17], [-0.78, -0.26, 0.12]],
  },
  {
    id: 'aorta-arm-right',
    kind: 'artery',
    radius: 0.014,
    opacity: 0.72,
    points: [[0.16, 0.92, 0.22], [0.48, 0.74, 0.2], [0.72, 0.28, 0.17], [0.78, -0.26, 0.12]],
  },
  {
    id: 'vena-core',
    kind: 'vein',
    radius: 0.014,
    opacity: 0.72,
    points: [[-0.08, 1.38, 0.12], [-0.12, 1, 0.18], [-0.11, 0.48, 0.2], [-0.1, -0.1, 0.14], [-0.22, -1.02, 0.1]],
  },
  {
    id: 'vena-right',
    kind: 'vein',
    radius: 0.012,
    opacity: 0.64,
    points: [[0.1, 1.3, 0.08], [0.16, 0.86, 0.14], [0.14, 0.3, 0.14], [0.22, -0.32, 0.1], [0.32, -1.18, 0.06]],
  },
  {
    id: 'nerve-left',
    kind: 'nerve',
    radius: 0.008,
    opacity: 0.5,
    points: [[-0.02, 1.55, -0.02], [-0.16, 1.12, 0.02], [-0.36, 0.52, 0.04], [-0.62, -0.08, 0.02], [-0.28, -1.28, -0.02]],
  },
  {
    id: 'nerve-right',
    kind: 'nerve',
    radius: 0.008,
    opacity: 0.5,
    points: [[0.02, 1.55, -0.02], [0.16, 1.12, 0.02], [0.36, 0.52, 0.04], [0.62, -0.08, 0.02], [0.28, -1.28, -0.02]],
  },
]

function toneColor(tone: HumanSignalTone) {
  switch (tone) {
    case 'danger': return colors.semantic.danger
    case 'warning': return colors.semantic.warning
    case 'success': return colors.semantic.success
    case 'tech': return colors.tech
    case 'brand': return colors.brand
    default: return colors.semantic.neutral
  }
}

function hasWebGLSupport() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function HumanPosture3D({ signals }: HumanPosture3DProps) {
  const theme = useTheme()
  const palette = useMemo<AnatomyPalette>(() => {
    const isDark = theme.palette.mode === 'dark'
    return {
      shell: isDark ? theme.palette.grey[300] : theme.palette.grey[700],
      shellRim: isDark ? theme.palette.primary.contrastText : theme.palette.info.light,
      bone: isDark ? theme.palette.grey[100] : theme.palette.grey[300],
      heart: colors.semantic.danger,
      lung: isDark ? theme.palette.info.light : theme.palette.info.dark,
      artery: colors.semantic.danger,
      vein: isDark ? theme.palette.primary.light : theme.palette.primary.dark,
      nerve: colors.semantic.warning,
      shield: theme.palette.primary.main,
      tech: colors.tech,
      floor: isDark ? theme.palette.grey[900] : theme.palette.grey[100],
      floorLine: isDark ? theme.palette.info.light : theme.palette.info.main,
    }
  }, [theme])

  if (!hasWebGLSupport()) {
    return (
      <div className="dashboard-human-webgl-fallback" role="img" aria-label={t('dashboard.human3dFallbackLabel')}>
        {signals.map((signal) => (
          <span key={signal.id} className={`dashboard-human-fallback-dot is-${signal.tone}`}>
            {signal.label} · {signal.value}
          </span>
        ))}
      </div>
    )
  }

  return (
    <Canvas
      className="dashboard-human-canvas"
      data-testid="dashboard-human-3d-canvas"
      camera={{ position: [0, 0, 5.82], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={theme.palette.mode === 'dark' ? 0.72 : 1.08} />
      <directionalLight position={[2.4, 4.2, 4.6]} intensity={1.15} color={theme.palette.common.white} />
      <pointLight position={[-2.6, 1.4, 2.5]} intensity={0.78} color={colors.semantic.danger} />
      <pointLight position={[2.8, 0.6, 2.8]} intensity={0.62} color={colors.tech} />
      <HumanRig signals={signals} palette={palette} />
    </Canvas>
  )
}

function HumanRig({ signals, palette }: {
  signals: HumanPostureSignal[]
  palette: AnatomyPalette
}) {
  const rigRef = useRef<THREE.Group>(null)
  const scanRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    const tNow = state.clock.getElapsedTime()
    if (rigRef.current) {
      rigRef.current.rotation.y = Math.sin(tNow * 0.32) * 0.16
      rigRef.current.position.y = -0.02 + Math.sin(tNow * 0.62) * 0.035
    }
    if (scanRef.current) {
      scanRef.current.rotation.y = tNow * 0.2
      scanRef.current.rotation.z = Math.sin(tNow * 0.34) * 0.1
    }
  })

  return (
    <group>
      <group ref={scanRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.48, 0.011, 8, 128]} />
          <meshBasicMaterial color={palette.shield} transparent opacity={0.44} />
        </mesh>
        <mesh rotation={[Math.PI / 2.35, 0, Math.PI / 3.5]}>
          <torusGeometry args={[1.86, 0.007, 8, 128]} />
          <meshBasicMaterial color={palette.tech} transparent opacity={0.28} />
        </mesh>
        <mesh position={[0, 0.22, -0.18]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.05, 0.004, 8, 128]} />
          <meshBasicMaterial color={palette.nerve} transparent opacity={0.18} />
        </mesh>
      </group>

      <group ref={rigRef}>
        <AnatomyShell palette={palette} />
        <AnatomyCore palette={palette} />
        {vascularPaths.map((path) => (
          <AnatomyVessel key={path.id} spec={path} palette={palette} />
        ))}
        {signals.slice(0, 6).map((signal, index) => (
          <Hotspot
            key={signal.id}
            signal={signal}
            index={index}
            position={anatomySignalPositions[signal.id]}
          />
        ))}
      </group>

      <mesh position={[0, -1.9, -0.1]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.24, 0.68, 1]}>
        <circleGeometry args={[1.9, 96]} />
        <meshBasicMaterial color={palette.floor} transparent opacity={0.46} />
      </mesh>
      <mesh position={[0, -1.88, -0.06]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.08, 0.62, 1]}>
        <torusGeometry args={[1.9, 0.006, 8, 128]} />
        <meshBasicMaterial color={palette.floorLine} transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

function AnatomyShell({ palette }: { palette: AnatomyPalette }) {
  return (
    <group>
      <SoftSphere position={[0, 1.62, 0.02]} scale={[0.26, 0.34, 0.23]} color={palette.shell} opacity={0.42} />
      <SoftSphere position={[0, 1.25, 0]} scale={[0.13, 0.18, 0.13]} color={palette.shell} opacity={0.34} />
      <ShellCapsule position={[-0.34, 1.12, 0]} rotation={[0, 0, Math.PI / 2.35]} length={0.58} radius={0.075} color={palette.shell} rim={palette.shellRim} opacity={0.32} />
      <ShellCapsule position={[0.34, 1.12, 0]} rotation={[0, 0, -Math.PI / 2.35]} length={0.58} radius={0.075} color={palette.shell} rim={palette.shellRim} opacity={0.32} />

      <SoftSphere position={[0, 0.72, 0]} scale={[0.54, 0.72, 0.3]} color={palette.shell} opacity={0.29} />
      <SoftSphere position={[0, 0.12, 0.02]} scale={[0.4, 0.52, 0.25]} color={palette.shell} opacity={0.27} />
      <SoftSphere position={[0, -0.42, 0]} scale={[0.52, 0.32, 0.28]} color={palette.shell} opacity={0.3} />

      <ShellCapsule position={[-0.58, 0.75, 0]} rotation={[0, 0, -0.2]} length={0.72} radius={0.105} color={palette.shell} rim={palette.shellRim} opacity={0.34} />
      <ShellCapsule position={[-0.72, 0.05, 0.02]} rotation={[0, 0, 0.1]} length={0.72} radius={0.088} color={palette.shell} rim={palette.shellRim} opacity={0.32} />
      <SoftSphere position={[-0.72, -0.38, 0.04]} scale={[0.11, 0.16, 0.1]} color={palette.shell} opacity={0.36} />
      <ShellCapsule position={[0.58, 0.75, 0]} rotation={[0, 0, 0.2]} length={0.72} radius={0.105} color={palette.shell} rim={palette.shellRim} opacity={0.34} />
      <ShellCapsule position={[0.72, 0.05, 0.02]} rotation={[0, 0, -0.1]} length={0.72} radius={0.088} color={palette.shell} rim={palette.shellRim} opacity={0.32} />
      <SoftSphere position={[0.72, -0.38, 0.04]} scale={[0.11, 0.16, 0.1]} color={palette.shell} opacity={0.36} />

      <ShellCapsule position={[-0.22, -0.88, 0]} rotation={[0, 0, 0.05]} length={0.78} radius={0.12} color={palette.shell} rim={palette.shellRim} opacity={0.34} />
      <ShellCapsule position={[-0.22, -1.45, 0]} rotation={[0, 0, -0.03]} length={0.7} radius={0.095} color={palette.shell} rim={palette.shellRim} opacity={0.33} />
      <SoftSphere position={[-0.24, -1.86, 0.12]} scale={[0.19, 0.08, 0.27]} color={palette.shell} opacity={0.36} />
      <ShellCapsule position={[0.22, -0.88, 0]} rotation={[0, 0, -0.05]} length={0.78} radius={0.12} color={palette.shell} rim={palette.shellRim} opacity={0.34} />
      <ShellCapsule position={[0.22, -1.45, 0]} rotation={[0, 0, 0.03]} length={0.7} radius={0.095} color={palette.shell} rim={palette.shellRim} opacity={0.33} />
      <SoftSphere position={[0.24, -1.86, 0.12]} scale={[0.19, 0.08, 0.27]} color={palette.shell} opacity={0.36} />

      <mesh position={[0, 0.18, -0.02]} scale={[0.46, 1.02, 0.38]}>
        <sphereGeometry args={[0.74, 40, 34]} />
        <meshBasicMaterial color={palette.shellRim} wireframe transparent opacity={0.08} />
      </mesh>
    </group>
  )
}

function SoftSphere({ position, scale, color, opacity }: {
  position: [number, number, number]
  scale: [number, number, number]
  color: string
  opacity: number
}) {
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[1, 40, 32]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        roughness={0.2}
        metalness={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function ShellCapsule({ position, rotation, length, radius, color, rim, opacity }: {
  position: [number, number, number]
  rotation: [number, number, number]
  length: number
  radius: number
  color: string
  rim: string
  opacity: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <capsuleGeometry args={[radius, length, 16, 28]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} metalness={0.12} roughness={0.28} depthWrite={false} />
      </mesh>
      <mesh>
        <capsuleGeometry args={[radius * 1.04, length, 12, 24]} />
        <meshBasicMaterial color={rim} wireframe transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

function AnatomyCore({ palette }: { palette: AnatomyPalette }) {
  return (
    <group>
      <mesh position={[-0.16, 0.76, 0.08]} rotation={[0.08, 0.1, -0.18]} scale={[0.18, 0.3, 0.11]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color={palette.lung} emissive={palette.lung} emissiveIntensity={0.16} transparent opacity={0.42} roughness={0.36} />
      </mesh>
      <mesh position={[0.16, 0.76, 0.08]} rotation={[0.08, -0.1, 0.18]} scale={[0.18, 0.3, 0.11]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color={palette.lung} emissive={palette.lung} emissiveIntensity={0.16} transparent opacity={0.42} roughness={0.36} />
      </mesh>
      <group position={[0.04, 0.66, 0.27]} rotation={[0.1, -0.22, 0.25]}>
        <mesh position={[-0.04, 0.06, 0]} scale={[0.11, 0.13, 0.1]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshStandardMaterial color={palette.heart} emissive={palette.heart} emissiveIntensity={0.38} roughness={0.18} metalness={0.12} />
        </mesh>
        <mesh position={[0.06, 0.06, 0]} scale={[0.11, 0.13, 0.1]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshStandardMaterial color={palette.heart} emissive={palette.heart} emissiveIntensity={0.38} roughness={0.18} metalness={0.12} />
        </mesh>
        <mesh position={[0.01, -0.05, 0]} rotation={[0, 0, Math.PI]} scale={[0.13, 0.18, 0.12]}>
          <coneGeometry args={[1, 1.45, 32]} />
          <meshStandardMaterial color={palette.heart} emissive={palette.heart} emissiveIntensity={0.34} roughness={0.2} metalness={0.1} />
        </mesh>
      </group>
      <mesh position={[0, 0.08, -0.05]} rotation={[0, 0, 0]} scale={[0.048, 1.2, 0.048]}>
        <capsuleGeometry args={[1, 0.8, 12, 26]} />
        <meshStandardMaterial color={palette.bone} transparent opacity={0.66} roughness={0.32} metalness={0.08} />
      </mesh>
      {[-0.2, -0.1, 0, 0.1, 0.2].map((offset, index) => (
        <mesh key={offset} position={[0, 0.43 + index * 0.11, 0.04]} rotation={[0, 0, 0]} scale={[0.5 - index * 0.025, 0.14, 0.2]}>
          <torusGeometry args={[0.52, 0.009, 8, 64]} />
          <meshBasicMaterial color={palette.bone} transparent opacity={0.2} />
        </mesh>
      ))}
      <mesh position={[0, -0.43, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.48, 0.26, 0.12]}>
        <torusGeometry args={[0.72, 0.012, 8, 72]} />
        <meshBasicMaterial color={palette.bone} transparent opacity={0.18} />
      </mesh>
    </group>
  )
}

function AnatomyVessel({ spec, palette }: { spec: AnatomyPathSpec; palette: AnatomyPalette }) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(
      spec.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.34,
    ),
    [spec.points],
  )
  const color = spec.kind === 'artery' ? palette.artery : spec.kind === 'vein' ? palette.vein : palette.nerve

  return (
    <mesh>
      <tubeGeometry args={[curve, 72, spec.radius, 8, false]} />
      <meshBasicMaterial color={color} transparent opacity={spec.opacity} />
    </mesh>
  )
}

function Hotspot({ signal, index, position }: {
  signal: HumanPostureSignal
  index: number
  position: [number, number, number]
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const color = toneColor(signal.tone)
  const intensity = Math.max(0.18, Math.min(1, signal.intensity))

  useFrame((state) => {
    if (!meshRef.current) return
    const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 2.4 + index) * 0.14 * intensity
    meshRef.current.scale.setScalar(pulse)
    const material = meshRef.current.material as THREE.MeshStandardMaterial
    material.emissiveIntensity = 0.25 + intensity * 0.65
  })

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.065 + intensity * 0.045, 24, 20]} />
        <meshStandardMaterial color={color} emissive={color} roughness={0.25} metalness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15 + intensity * 0.09, 0.007, 8, 56]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} />
      </mesh>
      <mesh rotation={[Math.PI / 2.2, 0, Math.PI / 4]}>
        <torusGeometry args={[0.24 + intensity * 0.08, 0.004, 8, 56]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} />
      </mesh>
    </group>
  )
}
