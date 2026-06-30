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
  identity: [0, 1.92, 0.46],
  cloud: [-0.22, 1.1, 0.48],
  code: [-0.78, 0.72, 0.44],
  external: [0.78, 0.72, 0.44],
  runtime: [0, -0.28, 0.46],
  workflow: [0.28, 0.36, 0.48],
}

const vascularPaths: AnatomyPathSpec[] = [
  {
    id: 'aorta-head',
    kind: 'artery',
    radius: 0.018,
    opacity: 0.86,
    points: [[0.04, 0.95, 0.24], [0.02, 1.24, 0.22], [0, 1.52, 0.18], [0, 1.77, 0.16]],
  },
  {
    id: 'aorta-core',
    kind: 'artery',
    radius: 0.022,
    opacity: 0.92,
    points: [[0.02, 0.86, 0.26], [0, 0.46, 0.24], [0, 0.05, 0.2], [0, -0.38, 0.16], [-0.2, -0.84, 0.1]],
  },
  {
    id: 'aorta-leg-right',
    kind: 'artery',
    radius: 0.015,
    opacity: 0.72,
    points: [[0, -0.36, 0.16], [0.2, -0.78, 0.12], [0.28, -1.22, 0.08]],
  },
  {
    id: 'aorta-arm-left',
    kind: 'artery',
    radius: 0.014,
    opacity: 0.72,
    points: [[-0.1, 1.02, 0.22], [-0.42, 0.88, 0.2], [-0.68, 0.56, 0.17], [-0.86, 0.24, 0.12]],
  },
  {
    id: 'aorta-arm-right',
    kind: 'artery',
    radius: 0.014,
    opacity: 0.72,
    points: [[0.1, 1.02, 0.22], [0.42, 0.88, 0.2], [0.68, 0.56, 0.17], [0.86, 0.24, 0.12]],
  },
  {
    id: 'vena-core',
    kind: 'vein',
    radius: 0.014,
    opacity: 0.72,
    points: [[-0.08, 1.55, 0.12], [-0.12, 1.18, 0.18], [-0.11, 0.65, 0.2], [-0.1, 0.04, 0.14], [-0.22, -0.8, 0.1]],
  },
  {
    id: 'vena-right',
    kind: 'vein',
    radius: 0.012,
    opacity: 0.64,
    points: [[0.1, 1.46, 0.08], [0.16, 1, 0.14], [0.14, 0.42, 0.14], [0.22, -0.2, 0.1], [0.32, -0.94, 0.06]],
  },
  {
    id: 'nerve-left',
    kind: 'nerve',
    radius: 0.008,
    opacity: 0.5,
    points: [[-0.02, 1.72, -0.02], [-0.16, 1.28, 0.02], [-0.38, 0.7, 0.04], [-0.62, 0.18, 0.02], [-0.28, -0.92, -0.02]],
  },
  {
    id: 'nerve-right',
    kind: 'nerve',
    radius: 0.008,
    opacity: 0.5,
    points: [[0.02, 1.72, -0.02], [0.16, 1.28, 0.02], [0.38, 0.7, 0.04], [0.62, 0.18, 0.02], [0.28, -0.92, -0.02]],
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
      camera={{ position: [0, 0.34, 6.48], fov: 39 }}
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
      rigRef.current.position.y = -0.12 + Math.sin(tNow * 0.62) * 0.035
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

      <mesh position={[0, -1.5, -0.1]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.24, 0.68, 1]}>
        <circleGeometry args={[1.9, 96]} />
        <meshBasicMaterial color={palette.floor} transparent opacity={0.46} />
      </mesh>
      <mesh position={[0, -1.48, -0.06]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.08, 0.62, 1]}>
        <torusGeometry args={[1.9, 0.006, 8, 128]} />
        <meshBasicMaterial color={palette.floorLine} transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

function AnatomyShell({ palette }: { palette: AnatomyPalette }) {
  return (
    <group>
      <mesh position={[0, 1.84, 0]} scale={[0.72, 0.92, 0.66]}>
        <sphereGeometry args={[0.34, 48, 48]} />
        <meshStandardMaterial
          color={palette.shell}
          transparent
          opacity={0.24}
          roughness={0.18}
          metalness={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.67, 0]} scale={[0.82, 1.16, 0.5]}>
        <capsuleGeometry args={[0.48, 1.18, 24, 48]} />
        <meshStandardMaterial
          color={palette.shell}
          emissive={palette.shield}
          emissiveIntensity={0.06}
          transparent
          opacity={0.22}
          roughness={0.18}
          metalness={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -0.36, 0]} scale={[0.78, 0.48, 0.48]}>
        <sphereGeometry args={[0.54, 40, 28]} />
        <meshStandardMaterial color={palette.shell} transparent opacity={0.19} roughness={0.2} metalness={0.14} depthWrite={false} />
      </mesh>
      <ShellLimb position={[-0.57, 0.8, 0]} rotation={[0, 0, -0.36]} length={1.5} color={palette.shell} rim={palette.shellRim} />
      <ShellLimb position={[0.57, 0.8, 0]} rotation={[0, 0, 0.36]} length={1.5} color={palette.shell} rim={palette.shellRim} />
      <ShellLimb position={[-0.22, -0.92, 0]} rotation={[0, 0, 0.11]} length={1.18} color={palette.shell} rim={palette.shellRim} />
      <ShellLimb position={[0.22, -0.92, 0]} rotation={[0, 0, -0.11]} length={1.18} color={palette.shell} rim={palette.shellRim} />
      <mesh position={[0, 0.64, -0.04]} scale={[0.58, 1.26, 0.58]}>
        <sphereGeometry args={[0.78, 36, 32]} />
        <meshBasicMaterial color={palette.shellRim} wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  )
}

function ShellLimb({ position, rotation, length, color, rim }: {
  position: [number, number, number]
  rotation: [number, number, number]
  length: number
  color: string
  rim: string
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <capsuleGeometry args={[0.1, length, 14, 28]} />
        <meshStandardMaterial color={color} transparent opacity={0.22} metalness={0.12} roughness={0.28} depthWrite={false} />
      </mesh>
      <mesh>
        <capsuleGeometry args={[0.106, length, 12, 24]} />
        <meshBasicMaterial color={rim} wireframe transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

function AnatomyCore({ palette }: { palette: AnatomyPalette }) {
  return (
    <group>
      <mesh position={[-0.18, 0.88, 0.08]} rotation={[0.08, 0.1, -0.2]} scale={[0.2, 0.34, 0.12]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color={palette.lung} emissive={palette.lung} emissiveIntensity={0.16} transparent opacity={0.42} roughness={0.36} />
      </mesh>
      <mesh position={[0.18, 0.88, 0.08]} rotation={[0.08, -0.1, 0.2]} scale={[0.2, 0.34, 0.12]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color={palette.lung} emissive={palette.lung} emissiveIntensity={0.16} transparent opacity={0.42} roughness={0.36} />
      </mesh>
      <group position={[0.04, 0.74, 0.27]} rotation={[0.1, -0.22, 0.25]}>
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
      <mesh position={[0, 0.22, -0.05]} rotation={[0, 0, 0]} scale={[0.06, 1.08, 0.06]}>
        <capsuleGeometry args={[1, 0.65, 12, 26]} />
        <meshStandardMaterial color={palette.bone} transparent opacity={0.66} roughness={0.32} metalness={0.08} />
      </mesh>
      {[-0.18, -0.09, 0, 0.09, 0.18].map((offset, index) => (
        <mesh key={offset} position={[0, 0.55 + index * 0.12, 0.04]} rotation={[0, 0, 0]} scale={[0.58 - index * 0.035, 0.16, 0.22]}>
          <torusGeometry args={[0.55, 0.01, 8, 64]} />
          <meshBasicMaterial color={palette.bone} transparent opacity={0.2} />
        </mesh>
      ))}
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
