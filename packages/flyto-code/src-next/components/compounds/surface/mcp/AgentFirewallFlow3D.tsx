import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import * as THREE from 'three'
import { t, tOr } from '@lib/i18n';

type FlowStatus = 'allowed' | 'tokenized' | 'blocked'

interface FlowNode {
  id: string
  label: string
  sub: string
  position: [number, number, number]
  color: string
}

interface FlowEdge {
  from: string
  to: string
  status: FlowStatus
}

interface AgentFirewallFlow3DProps {
  live: boolean
  blocked: number
  tokenized: number
  allowed: number
}

const STATUS_COLOR: Record<FlowStatus, string> = {
  allowed: '#16a34a',
  tokenized: '#06b6d4',
  blocked: '#ef4444',
}

const NODES: FlowNode[] = [
  { id: 'user', label: t('hardcoded.users.sub.55aa36f5'), sub: t('hardcoded.identity.device.8e034d6a'), position: [-4.8, 1.4, 0], color: '#38bdf8' },
  { id: 'app', label: t('hardcoded.ai.apps.sub.shadow.ai.4be7c7f8'), sub: t('hardcoded.shadow.ai.635c53d3'), position: [-3.2, -1.35, 0.7], color: '#a78bfa' },
  { id: 'agent', label: t('hardcoded.agents.sub.62ee5a3b'), sub: t('hardcoded.tools.mcp.661a7856'), position: [-1.4, 0.15, -0.45], color: '#f59e0b' },
  { id: 'firewall', label: t('hardcoded.agent.firewall.sub.8.dimension.policy.a5961eac'), sub: t('hardcoded.8.dimension.policy.c0bb4280'), position: [0.9, 0, 0], color: '#7c3aed' },
  { id: 'dlp', label: t('hardcoded.ai.dlp.sub.tokenize.mask.507a1f76'), sub: t('hardcoded.tokenize.mask.3f137b10'), position: [2.7, 1.25, 0.3], color: '#06b6d4' },
  { id: 'internal', label: t('hardcoded.internal.assets.sub.vault.code.data.9b89bead'), sub: t('hardcoded.vault.code.data.e822807d'), position: [4.8, 0.55, -0.25], color: '#16a34a' },
  { id: 'external', label: t('hardcoded.external.egress.sub.blocked.or.held.e3d899c4'), sub: t('hardcoded.blocked.or.held.43f50e3d'), position: [4.6, -1.45, 0.55], color: '#ef4444' },
]

const EDGES: FlowEdge[] = [
  { from: 'user', to: 'app', status: 'allowed' },
  { from: 'app', to: 'agent', status: 'allowed' },
  { from: 'agent', to: 'firewall', status: 'allowed' },
  { from: 'firewall', to: 'dlp', status: 'tokenized' },
  { from: 'dlp', to: 'internal', status: 'allowed' },
  { from: 'firewall', to: 'external', status: 'blocked' },
]

export function AgentFirewallFlow3D({ live, blocked, tokenized, allowed }: AgentFirewallFlow3DProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        height: { xs: 360, md: 430 },
        minHeight: 320,
        borderRadius: 2.5,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        bgcolor: '#07111f',
      }}
    >
      <Canvas
        camera={{ position: [0, 3.7, 8.8], fov: 48 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#07111f']} />
          <ambientLight intensity={0.65} />
          <pointLight position={[0, 4, 6]} intensity={1.2} color="#a78bfa" />
          <pointLight position={[-6, 2, -4]} intensity={0.8} color="#38bdf8" />
          <FlowScene live={live} />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={0.35}
            minPolarAngle={Math.PI / 3.1}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Suspense>
      </Canvas>
      <Box sx={{ position: 'absolute', left: 16, top: 14, right: 16, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pointerEvents: 'none' }}>
        <Chip size="small" label={live ? t('agentFirewall.flowLive') : t('agentFirewall.flowWaiting')} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: live ? '#bbf7d0' : '#fde68a', bgcolor: live ? alpha('#16a34a', 0.22) : alpha('#f59e0b', 0.22), border: `1px solid ${live ? alpha('#16a34a', 0.45) : alpha('#f59e0b', 0.45)}` }} />
        <Chip size="small" label={`${blocked} ${t('agentFirewall.flowBlocked')}`} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: '#fecaca', bgcolor: alpha('#ef4444', 0.22), border: `1px solid ${alpha('#ef4444', 0.45)}` }} />
        <Chip size="small" label={`${tokenized} ${t('agentFirewall.flowTokenized')}`} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: '#cffafe', bgcolor: alpha('#06b6d4', 0.2), border: `1px solid ${alpha('#06b6d4', 0.45)}` }} />
        <Chip size="small" label={`${allowed} ${t('agentFirewall.flowAllowed')}`} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: '#bbf7d0', bgcolor: alpha('#16a34a', 0.18), border: `1px solid ${alpha('#16a34a', 0.4)}` }} />
      </Box>
      <Box sx={{ position: 'absolute', left: 16, right: 16, bottom: 14, maxWidth: 760, pointerEvents: 'none' }}>
        <Typography sx={{ color: '#f8fafc', fontWeight: 900, fontSize: { xs: 18, sm: 22 }, lineHeight: 1.15 }}>
          {t('agentFirewall.flowTitle')}
        </Typography>
        <Typography sx={{ mt: 0.6, color: alpha('#e2e8f0', 0.82), fontSize: 13.5, maxWidth: 720 }}>
          {t('agentFirewall.flowSubtitle')}
        </Typography>
      </Box>
    </Box>
  )
}

function FlowScene({ live }: { live: boolean }) {
  const nodeMap = useMemo(() => new Map(NODES.map((node) => [node.id, node])), [])
  return (
    <group>
      <FirewallGate live={live} />
      {EDGES.map((edge) => {
        const from = nodeMap.get(edge.from)
        const to = nodeMap.get(edge.to)
        if (!from || !to) return null
        return <FlowLine key={`${edge.from}-${edge.to}`} from={from.position} to={to.position} status={edge.status} />
      })}
      {NODES.map((node) => <FlowNodeMesh key={node.id} node={node} strong={node.id === 'firewall'} />)}
    </group>
  )
}

function FirewallGate({ live }: { live: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * (live ? 0.28 : 0.1)
  })
  return (
    <mesh ref={ref} position={[0.9, 0, 0]}>
      <boxGeometry args={[0.14, 2.85, 2.85]} />
      <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={live ? 0.75 : 0.35} roughness={0.25} metalness={0.25} transparent opacity={0.72} />
    </mesh>
  )
}

function FlowNodeMesh({ node, strong }: { node: FlowNode; strong?: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const pulse = Math.sin(clock.elapsedTime * 1.6 + node.position[0]) * 0.035
    ref.current.scale.setScalar((strong ? 1.22 : 1) + pulse)
  })
  return (
    <group position={node.position}>
      <mesh ref={ref}>
        <sphereGeometry args={[strong ? 0.42 : 0.28, 32, 32]} />
        <meshStandardMaterial color={node.color} emissive={node.color} emissiveIntensity={strong ? 0.68 : 0.38} roughness={0.28} metalness={0.18} />
      </mesh>
      <mesh>
        <sphereGeometry args={[strong ? 0.72 : 0.48, 24, 24]} />
        <meshBasicMaterial color={node.color} transparent opacity={strong ? 0.11 : 0.07} />
      </mesh>
      <Html center distanceFactor={7.8} position={[0, strong ? 0.78 : 0.56, 0]}>
        <Box sx={{ px: 1, py: 0.55, minWidth: 96, borderRadius: 1.2, bgcolor: alpha('#020617', 0.78), border: `1px solid ${alpha(node.color, 0.48)}`, color: '#f8fafc', textAlign: 'center', boxShadow: `0 10px 30px ${alpha('#000', 0.22)}` }}>
          <Typography sx={{ fontSize: 12, fontWeight: 900, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{tOr(`agentFirewall.flowNode.${node.id}`, node.label)}</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12, lineHeight: 1.1, color: alpha('#e2e8f0', 0.74), whiteSpace: 'nowrap' }}>{tOr(`agentFirewall.flowNode.${node.id}.sub`, node.sub)}</Typography>
        </Box>
      </Html>
    </group>
  )
}

function FlowLine({ from, to, status }: { from: [number, number, number]; to: [number, number, number]; status: FlowStatus }) {
  const color = STATUS_COLOR[status]
  const points = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const mid = a.clone().lerp(b, 0.5)
    mid.y += status === 'blocked' ? -0.75 : 0.65
    mid.z += status === 'tokenized' ? 0.55 : 0
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(32)
  }, [from, status, to])
  const pulseDelay = status === 'blocked' ? 0.64 : status === 'tokenized' ? 0.42 : 0
  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={status === 'blocked' ? 3.8 : 2.8}
        transparent
        opacity={status === 'blocked' ? 0.82 : 0.7}
      />
      <Line
        points={points}
        color={color}
        lineWidth={status === 'blocked' ? 8 : 6}
        transparent
        opacity={0.11}
      />
      <PulseAlong points={points} color={color} delay={pulseDelay} blocked={status === 'blocked'} />
    </>
  )
}

function PulseAlong({ points, color, delay, blocked }: { points: THREE.Vector3[]; color: string; delay: number; blocked?: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || points.length === 0) return
    const cycle = (clock.elapsedTime * 0.34 + delay) % 1
    const capped = blocked ? Math.min(cycle, 0.78) : cycle
    const idx = Math.min(points.length - 1, Math.floor(capped * (points.length - 1)))
    ref.current.position.copy(points[idx])
    const scale = blocked && cycle > 0.78 ? 1.65 + Math.sin(clock.elapsedTime * 9) * 0.12 : 1
    ref.current.scale.setScalar(scale)
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[blocked ? 0.09 : 0.075, 18, 18]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} />
    </mesh>
  )
}
