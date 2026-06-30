/**
 * Footprint scene palette — tier colours, signal glow, grade halo,
 * + theme-aware ScenePalette pairs.
 *
 * Extracted from FootprintGraphView.tsx Phase 5.
 */

import type { FootprintSignalKind } from '@lib/engine/code/footprintGraph'

export const TIER_PALETTE: Record<string, { color: string; emissive: string; opacity: number }> = {
  confirmed: { color: '#a78bfa', emissive: '#7c3aed', opacity: 1.0 },  // brand violet
  candidate: { color: '#fbbf24', emissive: '#d97706', opacity: 0.85 }, // amber (under-verification)
  weak:      { color: '#64748b', emissive: '#334155', opacity: 0.55 },
  rejected:  { color: '#475569', emissive: '#1e293b', opacity: 0.3 },
  unknown:   { color: '#94a3b8', emissive: '#475569', opacity: 0.7 },
}

export const SIGNAL_GLOW: Record<FootprintSignalKind, string> = {
  newly_exposed:    '#22d3ee', // cyan — fresh discovery
  recently_changed: '#f97316', // orange — re-seen after dormancy
  stale:            '#475569', // slate — haven't seen in a while
}

/** Grade → halo tone for the 3D ring around a node. Lowercase keys
 *  match what the engine emits in DomainFindingSummary.worst_grade. */
export const GRADE_HALO: Record<string, string> = {
  bad:     '#ef4444',
  warn:    '#f97316',
  fair:    '#eab308',
  neutral: '#94a3b8',
  good:    '#22c55e',
}

/** Per-mode scene palette. Light mode needs softer everything — a
 *  blackish navy backdrop next to MUI's `#ffffff` surrounding shell
 *  reads as "the 3D viewport is broken". On light, we want a cool
 *  off-white that pairs with `background.default` and lets the
 *  brand violet still pop without competing emissive halos. */
export interface ScenePalette {
  background: string
  fogColor: string
  fogNear: number
  fogFar: number
  edgeColor: string
  edgeHighlight: string
  starCount: number   // 0 = hide
  ambientIntensity: number
  haloOpacityNeutral: number
  haloOpacitySeed: number
  labelBg: string
  labelBorder: string
  labelColor: string
}

export const DARK_PALETTE: ScenePalette = {
  background: '#0b1220',
  fogColor: '#0b1220',
  fogNear: 14, fogFar: 32,
  edgeColor: '#475569',
  edgeHighlight: '#c4b5fd',
  starCount: 1800,
  ambientIntensity: 0.4,
  haloOpacityNeutral: 0.08,
  haloOpacitySeed: 0.22,
  labelBg: 'rgba(15,23,42,0.78)',
  labelBorder: 'rgba(148,163,184,0.25)',
  labelColor: '#f1f5f9',
}

export const LIGHT_PALETTE: ScenePalette = {
  background: '#f1f5f9',   // slate-100, cool & calm
  fogColor: '#f1f5f9',
  fogNear: 16, fogFar: 36,
  edgeColor: '#94a3b8',    // slate-400 — visible on light, not heavy
  edgeHighlight: '#7c3aed',
  starCount: 0,            // hide on light — stars on white look like JPEG noise
  ambientIntensity: 0.85,  // more fill, less specular
  haloOpacityNeutral: 0.05,
  haloOpacitySeed: 0.18,
  labelBg: 'rgba(255,255,255,0.92)',
  labelBorder: 'rgba(100,116,139,0.25)',
  labelColor: '#0f172a',
}
