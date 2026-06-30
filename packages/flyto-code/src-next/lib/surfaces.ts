/**
 * surfaces.ts — the single source of truth for "what security surfaces /
 * product pillars exist".
 *
 * WHY THIS EXISTS
 * The same surface list was hardcoded in several disconnected places:
 *   - AssetMapView `SURFACE_META` / `SURFACE_ORDER`
 *   - DashboardView `mode` (a 3-way external|code|combined enum)
 *   - scoring category weights
 *   - sidebar groups
 * Every new pillar (cloud shipped 2026-06; MCP / identity / SaaS are on the
 * backend roadmap PR-10+/PR-15) meant editing each of those by hand. This
 * registry makes a surface a piece of DATA: add one entry here and every
 * consumer that derives from it lights up. Dashboard mode / scoring / filters
 * should become "render the list", not "add another if-branch".
 *
 * DESIGN RULES
 *   - Pure leaf module: imports only icon + type. Nothing app-specific.
 *     Zero coupling — consumers depend on this; this depends on nobody.
 *   - One responsibility: declare surfaces + their presentation/gating
 *     metadata. Data presence ("does this org HAVE cloud?") is computed by
 *     consumers, never stored here.
 *   - Adding a surface = append one `SurfaceDef`. Do not branch on `id`
 *     anywhere; read from the def.
 */

import type { LucideIcon } from 'lucide-react'
import { Globe, Code2, Boxes, Cloud, Network, RadioTower } from 'lucide-react'

/** Known surface ids. Extend the union when a new pillar lands (then add its
 *  `SurfaceDef` below). */
export type SurfaceId = 'external' | 'code' | 'container' | 'cloud' | 'runtime' | 'unknown'
export type ProductSurfaceId = Exclude<SurfaceId, 'unknown'>

export interface SurfaceDef {
  id: SurfaceId
  /** English fallback label. User-facing copy goes through `labelKey`. */
  label: string
  /** i18n key (without the `code.` prefix). */
  labelKey: string
  /** Primary line / text colour (chips, icons, indicators). */
  color: string
  /** Soft background tint for chips / filter pills. */
  bg: string
  Icon: LucideIcon
  /** Sort weight — lower renders first. */
  order: number
  /** A real product pillar (appears in dashboard mode / scoring / nav).
   *  `unknown` is a catch-all bucket, not a pillar. */
  pillar: boolean
  /** Capability id (capabilities.yaml feature) that gates this surface's
   *  pages, when it has dedicated pages. */
  capability?: string
}

/** The registry. Colours/icons are the canonical surface palette (previously
 *  duplicated in AssetMapView.SURFACE_META — kept identical so migration is a
 *  no-op). */
export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  external:  { id: 'external',  label: 'External',  labelKey: 'surface.external',  color: '#2563eb', bg: '#dbeafe', Icon: Globe,   order: 0,  pillar: true,  capability: 'ctem' },
  code:      { id: 'code',      label: 'Code',      labelKey: 'surface.code',      color: '#16a34a', bg: '#dcfce7', Icon: Code2,   order: 1,  pillar: true,  capability: 'code_audit' },
  container: { id: 'container', label: 'Container', labelKey: 'surface.container', color: '#7c3aed', bg: '#ede9fe', Icon: Boxes,   order: 2,  pillar: true,  capability: 'code_audit' },
  cloud:     { id: 'cloud',     label: 'Cloud',     labelKey: 'surface.cloud',     color: '#0891b2', bg: '#cffafe', Icon: Cloud,   order: 3,  pillar: true,  capability: 'cspm' },
  runtime:   { id: 'runtime',   label: 'Runtime',   labelKey: 'surface.runtime',   color: '#ea580c', bg: '#ffedd5', Icon: RadioTower, order: 4, pillar: true, capability: 'mcp' },
  unknown:   { id: 'unknown',   label: 'Unknown',   labelKey: 'surface.unknown',   color: '#64748b', bg: '#e2e8f0', Icon: Network, order: 99, pillar: false },
}

/** All surfaces, sorted by `order`. */
export const SURFACE_LIST: SurfaceDef[] = Object.values(SURFACES).sort((a, b) => a.order - b.order)

/** Just the product pillars (excludes the `unknown` catch-all), sorted. */
export const PILLAR_SURFACES: SurfaceDef[] = SURFACE_LIST.filter(s => s.pillar)

/** Safe lookup — any unknown/empty id falls back to the `unknown` surface,
 *  so callers never crash on a surface the frontend hasn't modelled yet. */
export function surfaceDef(id?: string | null): SurfaceDef {
  return (id && (SURFACES as Record<string, SurfaceDef>)[id]) || SURFACES.unknown
}

/** Convenience: a surface's primary colour. */
export function surfaceColor(id?: string | null): string {
  return surfaceDef(id).color
}
