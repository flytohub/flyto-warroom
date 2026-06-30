/**
 * lib/tokens/severity.ts — canonical severity / grade / importance /
 * IoC kind color palettes.
 *
 * Replaces the 7+ inline tone tables that each compound was
 * redefining (FindingsView, IoCLookupView, SensorMapView,
 * WorldHeatGlobe, KpiPill, ThreatActorsView, MalwareFamiliesView,
 * RansomwareView, …). Single source of truth so a brand recolor =
 * 1 file edit, not 7.
 *
 * Each entry exports the same shape:
 *   { tone, soft, ring }
 *     tone — the primary hex (filled chips, icons, indicators)
 *     soft — same hue, ~10% alpha background (used as chip bg)
 *     ring — same hue, ~30% alpha border (used as chip border)
 *
 * If you need an inline color literal, import from here. The
 * literals themselves are co-located in this one file so a
 * brand shift is mechanical.
 */

import { alpha } from '@mui/material'

// ── Primitive hex anchors ────────────────────────────────────────
// These five red→green stops are the only place hex literals live.
// Everything else derives from them via alpha() / lookup tables.

const RED_500     = '#ef4444' // danger
const ORANGE_500  = '#f97316' // warning
const YELLOW_500  = '#eab308' // medium
const LIME_500    = '#84cc16' // letter-grade B (one stop up the A→F ramp)
const GREEN_500   = '#22c55e' // ok
const SLATE_500   = '#64748b' // neutral / unknown
const SLATE_400   = '#94a3b8' // softer neutral (importance: low)
const BLUE_500    = '#3b82f6' // info / credential kind
const VIOLET_500  = '#a855f7' // phishing kind
const DARK_RED    = '#dc2626' // stealer kind / threat actor pulse

export interface Tone {
  tone: string
  soft: string
  ring: string
}

function tone(hex: string): Tone {
  return {
    tone: hex,
    soft: alpha(hex, 0.10),
    ring: alpha(hex, 0.30),
  }
}

// ── Severity (critical / high / medium / low) ───────────────────
//
// Used by Findings table, CTEM Actions, Pulse, Issue rows,
// AutofixPreviewModal severity badge.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | ''

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: tone(RED_500),
  high:     tone(ORANGE_500),
  medium:   tone(YELLOW_500),
  low:      tone(SLATE_500),
  '':       tone(SLATE_400),
}

// ── Grade (Bitsight-parity bad / warn / fair / neutral / good) ──
//
// Lower-case to match the engine's normalised grade strings.

export type Grade = 'bad' | 'warn' | 'fair' | 'neutral' | 'good' | ''

export const GRADE_TONE: Record<Grade, Tone> = {
  bad:     tone(RED_500),
  warn:    tone(ORANGE_500),
  fair:    tone(YELLOW_500),
  neutral: tone(SLATE_400),
  good:    tone(GREEN_500),
  '':      tone(SLATE_400),
}

// ── Letter grade (A / B / C / D / F) ────────────────────────────
//
// The Bitsight-style A→F badge ramp: A green → B lime → C yellow →
// D orange → F red. This is the canonical for every A-F grade colour
// map (dashboard GRADE_COLORS, arch GRADE_COLOR, repo grade badges,
// the public scorecard). `''` / unknown falls back to neutral slate.

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F' | ''

export const LETTER_GRADE_TONE: Record<LetterGrade, Tone> = {
  A:  tone(GREEN_500),
  B:  tone(LIME_500),
  C:  tone(YELLOW_500),
  D:  tone(ORANGE_500),
  F:  tone(RED_500),
  '': tone(SLATE_400),
}

// ── Asset importance (critical / high / medium / low) ───────────
//
// Distinct palette from severity — `low` here is a neutral slate
// (an asset can be "low importance" without being a fail signal),
// whereas a "low severity finding" is mildly bad.

export type AssetImportance = 'critical' | 'high' | 'medium' | 'low' | ''

export const IMPORTANCE_TONE: Record<AssetImportance, Tone> = {
  critical: tone(RED_500),
  high:     tone(ORANGE_500),
  medium:   tone(YELLOW_500),
  low:      tone(SLATE_400),
  '':       tone(SLATE_400),
}

// ── IoC kind (c2 / url / ip / phishing / credential / hash / …) ─
//
// Used by IoC Lookup tiles + chip render.

export type IoCKind =
  | 'c2'
  | 'url'
  | 'ip'
  | 'phishing'
  | 'credential'
  | 'stealer'
  | 'breach'
  | 'hash'
  | 'cve'
  | ''

export const KIND_TONE: Record<IoCKind, Tone> = {
  c2:         tone(RED_500),
  url:        tone(ORANGE_500),
  ip:         tone(YELLOW_500),
  phishing:   tone(VIOLET_500),
  credential: tone(BLUE_500),
  stealer:    tone(DARK_RED),
  breach:     tone(SLATE_500),
  hash:       tone(SLATE_500),
  cve:        tone(ORANGE_500),
  '':         tone(SLATE_400),
}

// ── Threat-activity label (accelerating / declining / steady) ───

export type ThreatActivity = 'accelerating' | 'declining' | 'steady' | ''

export const ACTIVITY_TONE: Record<ThreatActivity, Tone> = {
  accelerating: tone(RED_500),
  declining:    tone(GREEN_500),
  steady:       tone(SLATE_500),
  '':           tone(SLATE_400),
}

// ── Heat-map intensity ramp ─────────────────────────────────────
//
// Used by the world choropleth (and any future heatmap). Returns a
// soft-tan → vivid-red color for an intensity in [0, 1]. The 5
// stops align with the SEVERITY_TONE palette so the visual story
// stays consistent across pages.

export function heatColor(intensity: number): string {
  if (intensity <= 0)   return alpha(SLATE_400, 0.18)
  if (intensity < 0.2)  return alpha('#fca5a5', 0.55) // red-300
  if (intensity < 0.4)  return alpha('#f87171', 0.65) // red-400
  if (intensity < 0.6)  return alpha(RED_500, 0.75)
  if (intensity < 0.8)  return alpha(DARK_RED, 0.85)
  return alpha('#b91c1c', 0.95) // red-700
}

// ── Re-exports for direct hex access where needed ───────────────
//
// Most consumers should use the *_TONE tables above. These named
// exports are for the rare case where a hex literal is unavoidable
// (e.g., three.js Color constructor expecting a string).

export const RAW = {
  red500:    RED_500,
  orange500: ORANGE_500,
  yellow500: YELLOW_500,
  green500:  GREEN_500,
  slate500:  SLATE_500,
  slate400:  SLATE_400,
  blue500:   BLUE_500,
  violet500: VIOLET_500,
  darkRed:   DARK_RED,
} as const
