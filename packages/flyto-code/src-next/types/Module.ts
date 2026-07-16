/**
 * Module.ts — single source of truth for the workspace top-level
 * surface area.
 *
 * Each `Module` describes one URL-addressable destination + its
 * sidebar nav entry + its capability gate. The concrete registry is
 * split by package under `types/module-manifests/`; this file is just
 * the shape.
 *
 * Drives:
 *   - route.tsx          (FeatureGate + WorkspacePageLoader)
 *   - WorkspaceSidebar   (group → label → icon → count)
 *   - WorkspaceLayout    (FULL_BLEED_PAGES = filter of fullBleed=true)
 *
 * Adding a new module = add one entry to the relevant package manifest.
 * No more 5-file edit dance to introduce a route.
 */

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Sidebar grouping. Render order is controlled by
 *  `SIDEBAR_GROUP_ORDER` in `types/module-manifests/index.ts`.
 *  `hidden` = route exists but no sidebar entry (e.g.
 *  /repos/:repoId detail page, /org chart). */
export type ModuleGroup =
  | 'overview'   // Dashboard / Pulse / Footprint
  | 'assets'     // Repos / Domains / Asset Map
  | 'code'       // Code Issues / Pentest / AutoFix
  | 'exposure'   // Posture / Findings / CTEM / Attack Paths / Mitigations / Vendor Risk
  | 'cloud'      // Cloud Posture / CSPM Findings
  | 'runtime'    // Agent Firewall (agent / runtime guardrails)
  | 'identity'   // Identity Security (IdP posture — BYO provider)
  | 'darkweb'    // Threat Actors / Malware / Ransomware / IoC / Sensor Map / Brand
  | 'history'    // Audit Timeline
  | 'scoring'    // Score Trends / Compliance
  | 'operations' // Operations health (connector / scan / system) — operator plane
  | 'enterprise' // Enterprise-only control plane: edition boundary + audit ledger
  | 'admin'      // Reports / VA Report / Settings (bottom)
  | 'hidden'     // routed but not in sidebar (repo detail / org chart)

/** Dynamic count slot — sidebar renders a small chip after the
 *  label. The slot name is resolved at render-time against
 *  WorkspaceSidebar's count hooks (issueCount / autofixCount /
 *  repoCount / domainCount). Undefined = no count chip. */
export type CountSlot = 'issues' | 'autofix' | 'repos' | 'domains'

export type ModuleEdition = 'ce' | 'enterprise' | 'saas' | 'internal'

export type ModulePackage =
  | 'overview'
  | 'assets'
  | 'code'
  | 'exposure'
  | 'cloud'
  | 'runtime'
  | 'identity'
  | 'operations'
  | 'enterprise'
  | 'darkweb'
  | 'future'
  | 'history'
  | 'scoring'
  | 'admin'
  | 'hidden'

export type ModuleMoat =
  | 'none'
  | 'commercial-intel'
  | 'enterprise-control-plane'
  | 'managed-remediation'
  | 'saas-control-plane'

export type ModuleLicenseTier = 'community' | 'team' | 'business' | 'enterprise'

export interface ModuleBoundary {
  /** Which edition owns the module implementation by default. */
  edition: ModuleEdition
  /** Physical package manifest that registers this route. */
  package: ModulePackage
  /** True when this module is safe to ship in the public CE source export. */
  exportable: boolean
  /** Unified cockpit surface this package merges back into. */
  mergeSurface: ModuleGroup
  /** Explicit moat marker so CE packaging cannot accidentally expose it. */
  moat: ModuleMoat
  /** Minimum commercial tier when the module is not community-owned. */
  licenseTier?: ModuleLicenseTier
}

export interface ModuleSidebar {
  group: ModuleGroup
  /** i18n key without the `code.` prefix (tOr will strip). */
  labelKey: string
  /** English fallback used when the key isn't loaded yet. */
  fallback: string
  icon: LucideIcon
  /** Optional dynamic count chip — render-time lookup. */
  count?: CountSlot
}
export interface Module {
  /** Canonical id; matches `capabilities.yaml.pages[id]`. */
  id: string
  /** URL path relative to /projects/:orgId/. */
  path: string
  /**
   * Capability id to gate this module on. Defaults to `id` when
   * omitted. Override only when the visible page is gated by a
   * differently-named capability (e.g. `asset-map` URL uses
   * `asset_map` page id).
   */
  capability?: string
  /**
   * Lazy-loaded React component for the route. Must be a no-arg
   * import returning `{ default: ComponentType }`.
   */
  lazyImport: () => Promise<{ default: ComponentType<unknown> }>
  /**
   * True = compound owns its own height + scroll; WorkspaceLayout
   * uses `overflow: hidden` outer shell. False = falls through to
   * the centered maxWidth:1200 + padding default card. Per
   * `feedback_full_bleed_path_list`, almost every modern compound
   * wants full-bleed.
   */
  fullBleed: boolean
  /** Sidebar nav entry. Omit for routed-only items (deep links,
   *  redirect targets). */
  sidebar?: ModuleSidebar
  /**
   * True when the destination renders a page-level <ModeView/> and
   * should expose the Manager / Engineer switch in the workspace
   * toolbar. Kept in the module manifest so route/sidebar/toolbar
   * metadata cannot drift into separate page lists.
   */
  dualMode?: boolean
  /**
   * Physical split/merge metadata. The route still works without it at
   * runtime, but contract tests require every workspace module to declare it
   * so CE, Enterprise, SaaS, and on-prem packaging cannot drift.
   */
  boundary?: ModuleBoundary
}
