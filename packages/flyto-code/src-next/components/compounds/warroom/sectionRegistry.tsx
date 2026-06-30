/**
 * sectionRegistry — single source of truth for "which view renders
 * for which section id".
 *
 * Before this lived as a 30-line if-chain inside WarRoomView, with 3
 * parallel Sets (HEALTH_SECTIONS / SELF_FETCH_SECTIONS / ALL_KNOWN)
 * that had to be hand-synced. Adding a section took edits in 4
 * places. Now: one entry per section, declares whether it needs the
 * health-summary fetch + how to render.
 *
 * The map is intentionally NOT colocated with sections.ts — sections.ts
 * is the nav structure (labels / icons / capability gates) and stays
 * free of heavy view imports. This file is where the actual component
 * tree gets wired.
 */
import type { ReactNode } from 'react'
import type { ConnectedRepo } from '@lib/engine'
import { ArchOverview, ArchDeps, ArchAPI, ArchDeadCode, ArchComplexity, ArchFrameworks, ArchImports, ArchRepos } from '@compounds/arch/ArchViews'
import { ScanDiffView } from '@compounds/arch/ScanDiffView'
import { SecurityOverview } from '@compounds/security/SecurityOverview'
// CICD section pulled from nav 2026-05-21 ("沒屁用"). Registry
// entries dropped too in the IA refactor 2026-05-21; compounds/cicd/
// kept on disk for future revival but not wired anywhere now.
import { ContainerScanView, CSPMScanView, IaCScanView, LicenseScanView, MalwareScanView, ReachabilityView, RuntimeEventsView } from '@compounds/scanning/ScanViews'
import { RedTeamView } from '@compounds/red-team/RedTeamView'
// CodeActivityView is the only history view still rendered through the
// war-room shim (/warroom/history-va) — AuditTimeline/VAReport/exp-*/
// scoring-* views were promoted to top-level routes and their dead
// registry entries removed 2026-06-05.
import { CodeActivityView } from '@compounds/history/HistoryFeedView'
import { AssetMapView } from '@compounds/asset-map/AssetMapView'
import { SecurityNewsView } from '@compounds/security/SecurityNews'
import type { OrgWarRoomData } from './WarRoomView'

/** Everything a section render fn might need. */
export interface SectionCtx {
  orgId?: string
  /** Present only when the section's `needsHealth` flag is true. */
  orgData?: OrgWarRoomData
  /** Repo id → ConnectedRepo lookup, derived from useConnectedRepos. */
  repoNameMap: Record<string, ConnectedRepo>
  /** Cross-section nav callback (PostureOverview's tab buttons etc.). */
  onNavigate?: (sectionId: string) => void
}

export interface SectionDef {
  /** True if this section requires the org-health-summary fetch. The
   *  dispatcher will block render on the fetch and hand orgData in. */
  needsHealth?: boolean
  /** Some views (ScoringView) manage their own full-height two-panel
   *  layout — the dispatcher should skip its Box wrapper. */
  bareLayout?: boolean
  render: (ctx: SectionCtx) => ReactNode
}

/** Empty-state hint when a section id resolves to nothing. */
export const NO_SECTION: SectionDef = {
  render: () => null,
}

/**
 * Every section the war-room can route to. Order is alphabetical by
 * id within each group for readability; runtime lookup is O(1).
 */
export const SECTION_REGISTRY: Record<string, SectionDef> = {
  // ── Architecture ────────────────────────────────────────────────
  'arch-overview':    { needsHealth: true, render: ({ orgData, repoNameMap }) => <ArchOverview data={orgData!} repoNameMap={repoNameMap} /> },
  'arch-api':         { needsHealth: true, render: ({ orgData, repoNameMap }) => <ArchAPI data={orgData!} repoNameMap={repoNameMap} /> },
  'arch-deps':        { needsHealth: true, render: () => <ArchDeps /> },
  'arch-dead-code':   { render: () => <ArchDeadCode /> },
  'arch-complexity':  { render: () => <ArchComplexity /> },
  'arch-frameworks':  { render: () => <ArchFrameworks /> },
  'arch-imports':     { render: () => <ArchImports /> },
  'arch-repos':       { render: () => <ArchRepos /> },
  'arch-scan-diff':   { render: () => <ScanDiffView /> },

  // ── Security ────────────────────────────────────────────────────
  'sec-overview':     { needsHealth: true, render: ({ orgData, repoNameMap, onNavigate }) => <SecurityOverview data={orgData!} repoNameMap={repoNameMap} onNavigate={onNavigate} /> },
  'sec-iac':          { render: () => <IaCScanView /> },
  'sec-license':      { render: () => <LicenseScanView /> },
  'sec-malware':      { render: () => <MalwareScanView /> },
  'sec-container':    { render: () => <ContainerScanView /> },
  'sec-cspm':         { render: () => <CSPMScanView /> },
  'sec-runtime':      { render: () => <RuntimeEventsView /> },
  'sec-reachability': { render: () => <ReachabilityView /> },
  'sec-redteam':      { render: () => <RedTeamView /> },
  'sec-asset-map':    { render: () => <AssetMapView /> },
  'sec-news':         { render: () => <SecurityNewsView /> },

  // ── CI/CD ───────────────────────────────────────────────────────
  // cicd-pr / cicd-gate registry entries dropped 2026-05-21. PR
  // signal already surfaces via Pulse's open-PR ContextStrip on
  // every finding row, which is the cross-dim join most operators
  // actually wanted out of these views.

  // ── History ─────────────────────────────────────────────────────
  // CodeActivityView (the code commit/PR activity feed) has no
  // promoted top-level home — it's reachable only via
  // /warroom/history-va, so its registry entry stays. AuditTimeline +
  // VAReport were promoted to /audit-timeline + /va-report and are
  // shadowed by WARROOM_ID_REDIRECTS at the route layer; their dead
  // registry entries were removed 2026-06-05.
  'history-va':       { render: ({ orgId }) => orgId ? <CodeActivityView orgId={orgId} /> : null },

  // ── Promoted-to-top-level (registry entries removed 2026-06-05) ──
  // The exp-* / history-ctem / history-vareport / scoring-* views were
  // all promoted to dedicated top-level routes (findings, posture-
  // overview, ctem-actions, brand-protection, attack-paths,
  // mitigations, vendors, audit-timeline, va-report, scoring,
  // score-trends, compliance). WARROOM_ID_REDIRECTS in route.tsx
  // intercepts /warroom/<old-id> with a <Navigate> BEFORE WarRoomView
  // mounts, so those registry entries were unreachable dead code. The
  // WarRoomView.test.tsx regression test asserts none of the
  // redirected ids resolve here while every remaining id does.
}

/** True if any section in the registry needs the health-summary fetch. */
export function sectionNeedsHealth(id: string): boolean {
  return SECTION_REGISTRY[id]?.needsHealth === true
}

/** True if this section id is registered. False = caller renders empty-state. */
export function isKnownSection(id: string): boolean {
  return id in SECTION_REGISTRY
}
