/**
 * NodeMesh — single 3D node sphere (chain entity or standalone).
 *
 * Extracted from FootprintGraphView.tsx Phase 5. Renders:
 *   - tier-colored core sphere + breathing glow halo
 *   - seed equatorial ring (depth=0 only)
 *   - standalone dual orbital rings (non-chain entities)
 *   - signal pulse animation (newly_exposed / recently_changed)
 *   - hover + selection scale-bump
 *   - findings overlay: grade-tinted equatorial torus + count
 *     badge + crimson threat-actor pulse halo
 *   - drei <Html> label (canonical_name + type icon)
 */

import { useEffect, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { Globe } from 'lucide-react'
import {
  promotionTier,
  relationshipScore,
  type FootprintEntity,
  type FootprintSignalKind,
} from '@lib/engine/code/footprintGraph'
import type { DomainFindingSummary } from '@lib/engine'

import { TIER_PALETTE, SIGNAL_GLOW, GRADE_HALO, type ScenePalette } from './palette'
import { TYPE_META } from './types'
import { glowTexture } from './glowTexture'

export interface NodeMeshProps {
  entity: FootprintEntity
  position: THREE.Vector3
  signal?: FootprintSignalKind
  isSelected: boolean
  onSelect: () => void
  palette: ScenePalette
  forceLabel?: boolean
  /** Standalone planet — not on the attack chain. Renders with a
   *  dashed orbital ring + slightly dimmer treatment so operators
   *  can distinguish "infrastructure / indicator" from "attack hop". */
  standalone?: boolean
  /** Findings overlay — when present, the node renders a count
   *  badge above the sphere + a worst-grade halo ring + a red
   *  pulse if the underlying findings are threat-actor linked. */
  findings?: DomainFindingSummary
  /** Focus-mode dim — when another node is selected and this one
   *  isn't in its neighbourhood, render at low opacity so the
   *  graph reads as "selection + neighbourhood + context fog".
   *  Operator design 2026-05-23 Codex #5 (focus mode). */
  dimmed?: boolean
}

export function NodeMesh({
  entity, position, signal, isSelected, onSelect, palette,
  forceLabel, standalone, findings, dimmed = false,
}: NodeMeshProps) {
  const ref = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Sprite>(null)
  const [hovered, setHovered] = useState(false)
  const tier = promotionTier(entity)
  const tierColors = TIER_PALETTE[tier] ?? TIER_PALETTE.unknown
  const score = relationshipScore(entity)
  const isSeed = entity.depth === 0
  // Size from score; seed gets a hero bump so it anchors the scene.
  const base = 0.14 + Math.min(Math.max(score, 0), 100) / 100 * 0.22
  const size = isSeed ? base * 1.8 : base
  // Standalone halo geometry — shrink the outer glow so the visual
  // footprint matches the semantic weight ("background context" not
  // "attack-chain hop"). Defined here (not lower down) so the breathing
  // useFrame can size the glow sprite.
  const haloScale = standalone ? 1.3 : 1.9
  // Soft-glow sprite base scale — the radial texture fades to 0 at its
  // edge, so we oversize ~3.4× the halo radius for a gentle bloom.
  const glowBase = size * haloScale * 3.4
  // Focus-mode hides labels of dimmed nodes — keeps the canvas
  // visually quiet when zoomed in on the neighbourhood. Hover
  // still re-surfaces a label even when dimmed.
  const showLabel = (isSelected || hovered || isSeed || forceLabel) && (!dimmed || hovered)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    let scale = 1
    if (signal === 'newly_exposed') scale = 1 + Math.sin(t * 3) * 0.06
    if (isSelected) scale *= 1.3
    if (hovered) scale *= 1.15
    ref.current.scale.setScalar(scale)
    // Soft glow sprite gently breathes + grows with hover/selection —
    // pure visual life, no semantic. Sized off glowBase so the bloom
    // tracks the node size.
    if (glowRef.current) {
      glowRef.current.scale.setScalar(glowBase * scale * (1 + Math.sin(t * 1.2 + position.x) * 0.05))
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect()
  }
  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const onPointerOut = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }
  // Canvas remount (e.g. Reset camera) while hovered leaves
  // document.body.style.cursor stuck on 'pointer'. Reset on unmount
  // so the next interaction starts clean.
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [])

  // Focus-mode dim multiplier — applied to every opacity below.
  // 0.25 reads as "context fog" while still keeping the node
  // visible enough for the operator to switch focus to it.
  // Standalone (vendor / tech / news) entities are demoted by an
  // additional 0.55× even when NOT dimmed — they're context, not
  // attack hops, and shouldn't dominate the canvas the way the
  // 2026-05-23 screenshot showed cloudflare / fastly Saturn halos
  // crowding out actual subdomains.
  const dim = (dimmed ? 0.25 : 1) * (standalone ? 0.55 : 1)
  return (
    <group position={position}>
      {/* Soft additive glow sprite — a radial-gradient bloom behind the
          core. Camera-facing, tinted by tier/signal, breathes via useFrame.
          Replaces the old hard sphere halo for a much softer falloff.
          toneMapped=false keeps it bright under ACES so it actually glows. */}
      <sprite ref={glowRef} scale={glowBase}>
        <spriteMaterial
          map={glowTexture()}
          color={signal ? SIGNAL_GLOW[signal] : tierColors.color}
          transparent
          opacity={(signal ? 0.6 : isSeed ? palette.haloOpacitySeed * 2.6 : palette.haloOpacityNeutral * 2.8) * dim}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      {/* Core sphere with physical material — clearcoat + metalness give
          the surface a glassy, premium read under the rim lights instead
          of a flat ball. */}
      <mesh
        ref={ref}
        onClick={handleClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhysicalMaterial
          color={tierColors.color}
          emissive={signal ? SIGNAL_GLOW[signal] : tierColors.emissive}
          emissiveIntensity={(signal ? 1.2 : isSeed ? 0.85 : 0.45) * (dimmed ? 0.4 : 1)}
          metalness={0.4}
          roughness={0.32}
          clearcoat={0.6}
          clearcoatRoughness={0.35}
          opacity={tierColors.opacity * dim}
          transparent
        />
      </mesh>
      {/* Seed wears a thin equatorial ring — instant "you are here". */}
      {isSeed && (
        <mesh rotation={[Math.PI / 2.2, 0, 0]}>
          <ringGeometry args={[size * 2.1, size * 2.25, 64]} />
          <meshBasicMaterial color={tierColors.color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Standalone — render two faint orbital rings (different axes)
          to visually communicate "this is an independent planet, not
          on the chain". No edges connect to standalones so the rings
          replace what the eye expects (a line) with something quieter. */}
      {standalone && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[size * 1.7, size * 1.78, 64]} />
            <meshBasicMaterial color={tierColors.color} transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 3]}>
            <ringGeometry args={[size * 2.1, size * 2.16, 64]} />
            <meshBasicMaterial color={tierColors.color} transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {showLabel && (
        <Html position={[0, size * 1.6, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: palette.labelColor,
            background: palette.labelBg,
            border: `1px solid ${palette.labelBorder}`,
            backdropFilter: 'blur(6px)',
            padding: '3px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
            boxShadow: '0 4px 14px rgba(15,23,42,0.18)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {(() => {
              const TypeIcon = TYPE_META[entity.type]?.Icon ?? Globe
              return <TypeIcon size={12} color={tierColors.color} />
            })()}
            <span>{entity.canonical_name}</span>
          </div>
        </Html>
      )}

      {/* Findings overlay — when ≥1 open finding lives on this
          asset, render a worst-grade equatorial ring + a count
          badge. Threat-actor-linked findings add a red pulse halo
          on top of the existing tier glow. */}
      {findings && findings.total > 0 && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[size * 1.35, size * 0.05, 8, 48]} />
            <meshBasicMaterial
              color={GRADE_HALO[findings.worst_grade] ?? GRADE_HALO.neutral}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
          {findings.has_threat_insight && (
            <mesh>
              <sphereGeometry args={[size * 2.3, 24, 24]} />
              <meshBasicMaterial
                color="#dc2626"
                transparent
                opacity={0.12}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          )}
          <Html position={[0, size * 2.0, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: findings.critical > 0
                ? '#dc2626'
                : findings.high > 0
                ? '#f97316'
                : findings.medium > 0
                ? '#eab308'
                : '#64748b',
              padding: '2px 6px',
              borderRadius: 999,
              minWidth: 18,
              textAlign: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.25)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {findings.total}
            </div>
          </Html>
        </>
      )}
    </group>
  )
}
