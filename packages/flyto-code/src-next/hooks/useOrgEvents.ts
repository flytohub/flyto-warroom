/**
 * useOrgEvents — subscribes to the engine's org-scoped SSE stream and
 * translates server events into React Query cache invalidations, so any
 * component that queries an affected resource refreshes without a page
 * refresh or a polling interval.
 *
 * Design choices:
 *   - fetch-event-source (not native EventSource) because we need an
 *     Authorization Bearer header on the request — EventSource can't set
 *     headers.
 *   - auto-reconnect with exponential backoff is handled by the library;
 *     we only need to refresh the Firebase token on each (re)open.
 *   - event→query mapping lives here, centralised, so adding a new event
 *     type is one entry in one switch rather than scattered listeners.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { env } from '@lib/env'
import { authHeader } from '@lib/engine/client'
import { emitPipelineEvent } from '@lib/cloud/pipelineEvents'
import {
  invalidateFootprintClosure,
  invalidateFootprintProgress,
} from '@lib/footprintLoop'
import { invalidateThreatIntelQueries } from '@lib/threatIntelLoop'
import { markDiscoveryStarted, markDiscoveryStep, markDiscoveryComplete } from './useDiscoveryStatus'
import {
  type EngineEventType, assertExhaustiveEvent,
} from '@lib/cloud/eventTypes.gen'
import { qk } from '@lib/queryKeys'

interface EngineEvent<T = unknown> {
  id: number
  workspaceId: string
  type: string
  payload?: T
  timestamp: string
}

export function useOrgEvents(orgId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!orgId) return
    const ctrl = new AbortController()
    let closed = false

    // Wrap so we can hand a fresh ID token to fetch-event-source on every
    // (re)connect — tokens expire after an hour.
    ;(async () => {
      try {
        await fetchEventSource(`${env.engineUrl}/api/v1/code/orgs/${orgId}/events`, {
          signal: ctrl.signal,
          openWhenHidden: true, // keep stream alive in background tabs
          async onopen(res) {
            if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) return
            // Auth error / server gone — tear down so the user sees stale
            // state rather than an infinite retry loop in the background.
            closed = true
            throw new Error(`SSE open failed: ${res.status}`)
          },
          async onmessage(msg) {
            if (!msg.event) return
            let data: EngineEvent = { id: 0, workspaceId: orgId, type: msg.event, timestamp: '' }
            try { data = { ...data, ...JSON.parse(msg.data) } } catch { /* keep envelope */ }
            handleEvent(qc, orgId, data)
          },
          onerror(err) {
            if (closed) throw err // stop retrying
            // Otherwise let the library retry with its default backoff.
            if (import.meta.env.DEV) console.debug('[org-events] reconnecting:', err)
          },
          fetch: async (input, init) => {
            // Attach a fresh Authorization token on every reconnect.
            const bearer = await authHeader()
            const headers = new Headers(init?.headers)
            if (bearer) headers.set('Authorization', bearer)
            return fetch(input, { ...init, headers })
          },
        })
      } catch (err) {
        if (import.meta.env.DEV && !closed) console.error('[org-events] stream ended:', err)
      }
    })()

    return () => { closed = true; ctrl.abort() }
  }, [orgId, qc])
}

/**
 * Event → query invalidation router. Keeping this as a plain function
 * (not a hook) so it's trivially testable and so new event types only
 * need a case added here.
 */
// Exported for direct unit-testing of the event → invalidation routing,
// independent of the SSE transport plumbing.
//
// The switch discriminates on a known union (EngineEventType, generated
// from internal/liveevent/hub.go). Adding a new event constant in the
// engine without handling it here is now a TypeScript error — the
// `default` branch calls assertExhaustiveEvent which only accepts
// `never`. This catches the "feature ships, frontend silent" class of
// bug the cross-stack audit flagged.
// Layered-audit timeline + verdict homepage + risk matrix all read
// org-derived state (scans, verify verdicts, pentest transitions, CTEM
// decisions). Any event that mutates those inputs should bust this set so
// the verdict homepage / matrix / timeline refresh live. Kept as one
// idempotent helper so cases stay one line and no key shape is duplicated.
function invalidateVerdictSurfaces(qc: ReturnType<typeof useQueryClient>, orgId: string): void {
  qc.invalidateQueries({ queryKey: qk.history.timeline(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.history.verdict(orgId) })
  qc.invalidateQueries({ queryKey: qk.history.riskMatrix(orgId) })
}

function invalidateAlertSurfaces(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  e: EngineEvent,
): void {
  const payload = e.payload as { alert_id?: string; id?: string; fingerprint?: string } | undefined
  const alertId = payload?.alert_id ?? payload?.id
  qc.invalidateQueries({ queryKey: qk.security.alerts(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.security.enrichedAlerts(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.security.issues(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.ctem.enrichedIssuesAll(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
  qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
  qc.invalidateQueries({ queryKey: qk.security.unifiedFindingAll(orgId), exact: false })
  if (payload?.fingerprint) {
    qc.invalidateQueries({ queryKey: qk.security.unifiedFinding(orgId, payload.fingerprint) })
  }
  if (alertId) {
    qc.invalidateQueries({ queryKey: qk.security.alertBlastGraph(alertId) })
  } else {
    qc.invalidateQueries({ queryKey: qk.security.alertBlastGraphAll(), exact: false })
  }
  invalidateVerdictSurfaces(qc, orgId)
}

function invalidatePlatformPipelineSurfaces(qc: ReturnType<typeof useQueryClient>, orgId: string): void {
  invalidateFootprintClosure(qc, orgId)
  qc.invalidateQueries({ queryKey: qk.pentest.projects(orgId) })
  qc.invalidateQueries({ queryKey: qk.repos.apiDefinitions(orgId) })
  qc.invalidateQueries({ queryKey: qk.repos.archMap(orgId) })
  qc.invalidateQueries({ queryKey: qk.exposure.assetCoverage(orgId) })
  qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
  invalidateVerdictSurfaces(qc, orgId)
}

function invalidateFindingLifecycleSurfaces(qc: ReturnType<typeof useQueryClient>, orgId: string): void {
  qc.invalidateQueries({ queryKey: qk.exposure.findingsBase(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.exposure.findingsFacets(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.exposure.findingHistoryBase(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.exposure.findingAssets(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerFacets(orgId) })
  qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerRollup(orgId) })
  qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerHistory(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
  qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
  qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
  qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.reports.sources(orgId) })
  invalidateFootprintClosure(qc, orgId)
  invalidateVerdictSurfaces(qc, orgId)
}

// Coalesce the heavy discovery-derived invalidations during a long scan.
//
// A re-discovery sweep over a domain with hundreds of subdomains fires
// hundreds of `discovery.step` events. The list-driving queries it busts
// are expensive — `/attack-surface` is a ~1.2 MB payload that takes
// 2-9 s to answer and `/external-posture/kernel` 1-6 s — so invalidating
// them on EVERY step turns the Domains / Asset Map list into a permanent
// refetch storm: the engine is hammered by its own UI, and because each
// settle re-renders with whatever intermediate scan state landed, the
// row count visibly bounces (operator: "一下 8 個子網域 一下 1 個主網域
// 在那邊跳來跳去"). The discovery chip already shows live progress, so the
// list itself only needs to refresh periodically and once the scan
// settles. Throttle the step-driven refresh to one flush per window;
// `discovery.started` / `discovery.complete` force an immediate flush so
// the list still clears at the start and lands the final set at the end.
const DISCOVERY_HEAVY_THROTTLE_MS = 8000
const lastDiscoveryHeavyFlush = new Map<string, number>()

/** Reset the discovery throttle window — test-only, so module-level
 *  state doesn't leak between cases. */
export function __resetDiscoveryThrottle(): void {
  lastDiscoveryHeavyFlush.clear()
}

function invalidateDiscoveryHeavySurfaces(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  force: boolean,
): void {
  // Date.now() (not performance.now()) so a fresh org — last=0 — always
  // flushes the first event of a scan: now - 0 is the wall-clock epoch,
  // always ≫ the throttle window. Only the rapid follow-up steps within
  // the window are coalesced.
  const now = Date.now()
  if (!force) {
    const last = lastDiscoveryHeavyFlush.get(orgId) ?? 0
    if (now - last < DISCOVERY_HEAVY_THROTTLE_MS) return
  }
  lastDiscoveryHeavyFlush.set(orgId, now)

  qc.invalidateQueries({ queryKey: qk.attackSurface(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
  qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
  qc.invalidateQueries({ queryKey: qk.exposure.brandProtection(orgId) })
  qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) })
  qc.invalidateQueries({ queryKey: qk.exposure.assetCoverage(orgId) })
  qc.invalidateQueries({ queryKey: qk.domains.assetEvidence(orgId) })
  qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
  qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
  qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId), exact: false })
  qc.invalidateQueries({ queryKey: qk.repos.apiDefinitions(orgId) })
  qc.invalidateQueries({ queryKey: qk.repos.archMap(orgId) })
}

export function handleEvent(qc: ReturnType<typeof useQueryClient>, orgId: string, e: EngineEvent): void {
  const t = e.type as EngineEventType
  switch (t) {
    // Scan lifecycle — refresh health + per-repo scan polling targets.
    // Pentest scans share this topic but carry project_id instead of
    // repo_id, so the same case also drives the PentestView "Running…"
    // → count flip. Without this branch the row stayed stuck on
    // "Running…" until the 30s staleTime fired.
    // scan.stalled (last case below) — emitted by the engine's
    // stalled_scan_sweep worker when a queued/running row's
    // started_at passes the freshness threshold (engine restart,
    // dropped scan.complete, subprocess crash). Same invalidation
    // set as scan.failed — the row flipped terminal, UI just
    // needs to refresh.
    case 'scan.queued':
    case 'scan.running':
    case 'scan.complete':
    case 'scan.failed':
    case 'scan.stalled': {
      const payload = e.payload as { repo_id?: string; project_id?: string } | undefined
      qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
      // (M1) ['org-health-summary'] was a second key for the SAME data
      // (same getOrgHealthSummary queryFn) — WarRoomView now reads
      // qk.repos.healthSummary too, so one invalidation covers it.
      qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.brandProtection(orgId) })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.assetCoverage(orgId) })
      qc.invalidateQueries({ queryKey: qk.domains.assetEvidence(orgId) })
      // (P0-8) IssuesView reads qk.security.issuesEnrichedFiltered
      // (['issues', orgId, 'enriched', …filters]); the bare 'issues'
      // literal it used to bust never matched, so scan/autofix
      // completions never refreshed the issues list. Invalidate the
      // whole ['issues', orgId] prefix with exact:false so every
      // enriched/filtered variant and the plain key are caught.
      qc.invalidateQueries({ queryKey: qk.security.issues(orgId), exact: false })
      // The manager / CTEM views read a SEPARATE ['enriched-issues', orgId,
      // scope] family that the 'issues' prefix above never reaches, so they
      // stayed stale after a scan. Bust the whole family by org prefix.
      qc.invalidateQueries({ queryKey: qk.ctem.enrichedIssuesAll(orgId), exact: false })
      // (P0-1) PulseView keys are ['pulse', orgId, window, pageSize];
      // the exact ['pulse', orgId] match never fired. exact:false busts
      // every window/pageSize variant — restores the war-room spine.
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.autofix.findingsCount(orgId) })
      if (payload?.repo_id) {
        qc.invalidateQueries({ queryKey: qk.repos.scans(payload.repo_id) })
        qc.invalidateQueries({ queryKey: qk.repos.health(payload.repo_id) })
        qc.invalidateQueries({ queryKey: qk.repos.profile(payload.repo_id) })
      }
      if (payload?.project_id) {
        qc.invalidateQueries({ queryKey: qk.pentest.scans(payload.project_id) })
        qc.invalidateQueries({ queryKey: qk.pentest.projects(orgId) })
        // (P1-17) pentest.analyze is 30s-stale — refresh it for the
        // project whose scan just completed.
        qc.invalidateQueries({ queryKey: qk.pentest.analyze(payload.project_id) })
        // (P2-24) scan-findings detail cache — busts the per-scan
        // findings drawer (keyed [.., projectId, scanId]) via prefix.
        qc.invalidateQueries({ queryKey: qk.pentest.scanFindings(payload.project_id), exact: false })
      }
      // (GAP-ARCH-001) A finished code scan re-derives the architecture
      // map from the fresh scan + asset tables. Only scan.complete should
      // bust it — the queued/running/failed/stalled transitions in this
      // shared block don't change the arch graph.
      if (t === 'scan.complete') {
        qc.invalidateQueries({ queryKey: qk.repos.archMap(orgId) })
        // A finished scan changes the inputs to the verdict homepage,
        // risk matrix and layered timeline (new findings → new paths /
        // grades / feed items). Only the terminal complete settles them.
        invalidateVerdictSurfaces(qc, orgId)
      }
      return
    }

    // Container image scan complete — refresh the container posture
    // summary + findings list so the Runtime/Cloud container surface
    // lands without polling. Payload: {org_id}.
    case 'container.scan.complete': {
      qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.connections(orgId) })
      return
    }

    // Cloud posture scan (CSPM) complete — refresh the cloud posture
    // summary + CSPM findings list. Payload: {org_id}.
    case 'cloud.scan.complete': {
      qc.invalidateQueries({ queryKey: qk.cloud.posture(orgId) })
      qc.invalidateQueries({ queryKey: qk.cloud.cspmFindings(orgId) })
      return
    }

    // Identity/IAM posture scan complete — refresh the identity posture
    // summary. Payload: {org_id}.
    case 'identity.scan.complete': {
      qc.invalidateQueries({ queryKey: qk.identity.posture(orgId) })
      return
    }

    // Attack-surface discovery — every step completion lets the UI
    // refresh exactly the tile that just landed. Beyond the obvious
    // attack-surface refresh, downstream tabs (API definitions,
    // arch map, fix plan) all derive from the same scan + asset
    // tables, so we invalidate them too — without this the user
    // sees "尚未產生" / "No project linked" empty states that should
    // already have data.
    case 'discovery.started':
    case 'discovery.step':
    case 'discovery.complete':
    case 'discovery.step_failed':
    case 'discovery.truncated': {
      // Heavy list-driving + score surfaces: throttled during a long
      // scan so hundreds of step events don't trigger overlapping
      // multi-second 1.2 MB refetches (which made the list flicker).
      // started/complete force an immediate flush. See
      // invalidateDiscoveryHeavySurfaces for the why.
      const settle = t === 'discovery.started' || t === 'discovery.complete'
      invalidateDiscoveryHeavySurfaces(qc, orgId, settle)
      // Cheap, always-on: the discovery chip + runs panels must stay
      // live every step so the operator sees progress + can cancel.
      qc.invalidateQueries({ queryKey: qk.exposure.discoveriesActive(orgId) })
      qc.invalidateQueries({ queryKey: qk.pentest.projects(orgId) })
      // (P1-6) discovery panels never refreshed — bust the discovery
      // runs list + verifier source health (both keyed with a trailing
      // limit/hours param, so exact:false).
      qc.invalidateQueries({ queryKey: qk.exposure.discoveryRuns(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.verifierSourceHealth(orgId), exact: false })
      // Track discovery status for scanning indicators
      const dpayload = e.payload as { project_id?: string } | undefined
      if (dpayload?.project_id) {
        qc.invalidateQueries({ queryKey: qk.domains.analysis(dpayload.project_id) })
        if (e.type === 'discovery.started') markDiscoveryStarted(dpayload.project_id)
        else if (e.type === 'discovery.step') markDiscoveryStep(dpayload.project_id)
        else if (e.type === 'discovery.complete') {
          markDiscoveryComplete(dpayload.project_id)
          // (P1) the pentest scorecard (pentest.analyze, 30s-stale) is
          // re-derived from the discovery output; only the terminal
          // discovery.complete settles it, so gate the invalidation
          // here (mirror of the scan-block :180 pattern) rather than
          // firing on every discovery.step.
          qc.invalidateQueries({ queryKey: qk.pentest.analyze(dpayload.project_id) })
        }
      }
      // New layered-timeline / verdict-homepage / risk-matrix surfaces
      // derive from the discovery output (new assets + posture deltas),
      // so refresh them when discovery settles.
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // Continuous monitoring — backend's discovery.changes detector fired
    // (cert / DNS / subdomain delta on an always-on sweep). Refresh the
    // monitoring-events feed plus the posture surfaces that summarise those
    // deltas, so the change lands without waiting for a poll. Distinct from
    // the discovery.* scan-step events above — this one is the standing
    // monitor, not a per-scan tile.
    case 'discovery.changes': {
      qc.invalidateQueries({ queryKey: qk.exposure.monitoringEvents(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.postureSnapshots(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.assetCoverage(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      // (P1-6) discovery panels never refreshed — bust the discovery
      // runs list + verifier source health so the standing-monitor
      // surfaces update without a poll.
      qc.invalidateQueries({ queryKey: qk.exposure.discoveryRuns(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.verifierSourceHealth(orgId), exact: false })
      return
    }

    // Score transition monitoring — the backend saved a durable
    // monitoring_events row for an alert-worthy score drop/flap and
    // pushed score.changed on the same path. Refresh both score history
    // and the posture/Pulse surfaces that explain why the transition
    // happened.
    case 'score.changed': {
      qc.invalidateQueries({ queryKey: qk.exposure.monitoringEvents(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.postureSnapshots(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.assetCoverage(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // Capability snapshot changed (entitlement, project type, or member role).
    // These keys drive nav, route gates, action buttons, and settings manager
    // capability panels. Fail-closed UI means stale positive grants are worse
    // than a brief skeleton, so bust all capability-shaped caches immediately.
    case 'capabilities.changed': {
      qc.invalidateQueries({ queryKey: qk.platform.capabilities(orgId) })
      qc.invalidateQueries({ queryKey: qk.settingsManager.capabilities(orgId) })
      qc.invalidateQueries({ queryKey: qk.platform.rbacUserCapabilities(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.platform.orgs() })
      return
    }

    // Integration health — probeGitHub flagged an expired/missing GitHub
    // credential. Invalidate the banner's query so IntegrationHealthBanner
    // raises immediately instead of waiting for its next health-probe poll.
    case 'integration.expired': {
      qc.invalidateQueries({ queryKey: qk.integrations.health(orgId) })
      return
    }

    // (P1-5) Code-issue lifecycle (snooze/ignore/solve) changed via
    // UpsertIssueStatus. Bust the enriched issues feed (status column)
    // AND autofix findings — autofix eligibility can flip when an issue
    // is solved/ignored. Payload: {org_id, fingerprint, status}.
    case 'issue.status_changed': {
      qc.invalidateQueries({ queryKey: qk.security.issues(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.ctem.enrichedIssuesAll(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.autofix.findingsCount(orgId) })
      // A status flip (snooze/ignore/solve) is a decision event that
      // moves matrix good/bad counts + verdict + timeline (L4 decision).
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // External CTEM issue state change (mark-fixed / assign / verify).
    // Refresh the prioritised feed + external posture surfaces. ctem
    // priorities is keyed with a scope/bu sub-param across views, so
    // exact:false. Payload: {org_id, issue_id, action}.
    case 'external_issue.updated': {
      invalidateFindingLifecycleSurfaces(qc, orgId)
      return
    }

    // Finding lifecycle/history — Bitsight/provider ingest, operator comments,
    // bulk resolves, verify/reopen/supersede events. This is the CTEM
    // continuous-monitoring spine: list, drawer, Footprint overlay, Asset
    // Coverage, risk matrix and reports all derive from these rows.
    case 'finding.lifecycle': {
      invalidateFindingLifecycleSurfaces(qc, orgId)
      return
    }

    // Company scope graph — holding company/subsidiary/brand/app/seed asset
    // declarations landed in Resource Kernel. This can change what
    // Footprint, Asset Coverage, Brand Protection, CTEM findings and reports
    // mean, so route through the same closed-loop invalidation as durable
    // finding lifecycle changes.
    case 'company_scope.updated': {
      invalidateFindingLifecycleSurfaces(qc, orgId)
      return
    }

    // Global threat-intel catalog refresh. Any upstream refresh can change the
    // visible catalogs, feed status, IoC lookup, sensor map, and manager cards;
    // keep SSE on the same fan-out as the admin refresh button.
    // Payload: {catalog, count}.
    case 'threatintel.refresh': {
      invalidateThreatIntelQueries(qc, orgId)
      return
    }

    // Repo connect/disconnect from another war-room tab — refresh the
    // connected-repos list + org so the second tab reflects the change
    // without staleTime. Payload: {org_id, repo_id}.
    case 'repo.connected':
    case 'repo.disconnected': {
      qc.invalidateQueries({ queryKey: qk.repos.connected(orgId) })
      qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
      return
    }

    // Pentest project lifecycle (auto-linked to a repo at create by the
    // BE). Refresh the projects list. Payload: {org_id, project_id,
    // linked_repo_id?}.
    case 'pentest_project.created':
    case 'pentest_project.deleted': {
      qc.invalidateQueries({ queryKey: qk.pentest.projects(orgId) })
      // Adding/removing a pentest project changes the asset set the
      // risk matrix + verdict homepage + timeline range over.
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // Runtime SDK telemetry landed — refresh the runtime view.
    // Payload: {org_id, accepted}.
    case 'runtime.event': {
      qc.invalidateQueries({ queryKey: qk.platform.runtimeEvents(orgId) })
      return
    }

    // Verify loop — drawer + recent-verifications list refresh.
    case 'verify.dispatched':
    case 'verify.terminal': {
      const payload = e.payload as { execution_id?: string } | undefined
      qc.invalidateQueries({ queryKey: qk.security.repoVerificationsAll() })
      if (payload?.execution_id) {
        qc.invalidateQueries({ queryKey: qk.security.workflowExecution(payload.execution_id) })
      }
      // (P1-4) once verify reaches a terminal verdict, the enriched
      // issues feed gains a pentest_verdict signal — bust the whole
      // ['issues', orgId] prefix so IssuesView's enriched key lights up.
      if (t === 'verify.terminal') {
        qc.invalidateQueries({ queryKey: qk.security.issues(orgId), exact: false })
        qc.invalidateQueries({ queryKey: qk.ctem.enrichedIssuesAll(orgId), exact: false })
        // A terminal verdict can confirm/clear an attack path (verified
        // reachable → RedTeamConfirmed) — moves verified_attack_paths /
        // verified_safe on the homepage, matrix grades, and the timeline.
        invalidateVerdictSurfaces(qc, orgId)
      }
      return
    }

    // Red team — runner reported a state transition. Callback-driven
    // so the war room drops polling in favour of a 1 s SSE update.
    case 'campaign_execution.updated': {
      const payload = e.payload as { campaign_execution_id?: string } | undefined
      qc.invalidateQueries({ queryKey: qk.pentest.campaignExecutions(orgId) })
      qc.invalidateQueries({ queryKey: qk.pentest.runnerStatus(orgId) })
      qc.invalidateQueries({ queryKey: qk.warroomVerification.runs(orgId) })
      if (payload?.campaign_execution_id) {
        qc.invalidateQueries({
          queryKey: qk.warroomVerification.evidence(orgId, payload.campaign_execution_id),
        })
        qc.invalidateQueries({
          queryKey: qk.security.workflowExecution(payload.campaign_execution_id),
        })
      }
      // A red-team campaign transition can move a path to/from
      // RedTeamConfirmed (the only verified_attack_paths source) —
      // refresh verdict homepage + matrix + timeline.
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // Red team — token budget policy breached. Banner + incident
    // table need a refetch so operators see the open incident.
    case 'campaign_budget.breach': {
      qc.invalidateQueries({ queryKey: qk.pentest.campaignBudgetIncidents(orgId) })
      qc.invalidateQueries({ queryKey: qk.pentest.campaignBudgetPolicies(orgId) })
      return
    }

    // AutoFix run complete — refresh inventory count + Pulse feed so
    // the sidebar badge and pulse cards update without manual reload.
    case 'autofix.complete': {
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.autofix.findingsCount(orgId) })
      qc.invalidateQueries({ queryKey: qk.autofix.runs(orgId) })
      // (P0-1/P0-8) exact:false so paged pulse + enriched-issues
      // variants are caught.
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.security.issues(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.ctem.enrichedIssuesAll(orgId), exact: false })
      return
    }

    case 'remediation.changed': {
      qc.invalidateQueries({ queryKey: qk.remediation.targetsAll(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.remediation.plansAll(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.remediation.runsAll(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.remediation.artifactsAll(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      return
    }

    // MCP Runtime Guardian — external proxy ingest and dashboard test probes
    // both write digest-only call events. Refresh the overview, egress, evidence
    // report, and AI governance surfaces so open Agent Firewall tabs do not
    // drift from the runtime event stream.
    case 'mcp.event.ingested': {
      qc.invalidateQueries({ queryKey: qk.mcp.overview(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.egress(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.evidence(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.aiGovernanceScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.aiGovernanceEvents(orgId) })
      // (P2-11) detail drawers (explanation / event-explanation /
      // session timeline) are keyed with a trailing eventId/sessionId,
      // so bust them by org-scoped prefix with exact:false.
      qc.invalidateQueries({ queryKey: qk.mcp.explanation(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.mcp.eventExplanation(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.mcp.sessionTimeline(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreHistory(orgId) })
      qc.invalidateQueries({ queryKey: qk.scoring.scoreEvents(orgId) })
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      invalidateVerdictSurfaces(qc, orgId)
      return
    }

    // AI Governance lifecycle/runtime overlay — use-case changes and
    // governance gaps/holds/blocks share one append-only ledger. Refresh the
    // score, register, and timeline together so approval state cannot drift
    // from runtime evidence.
    case 'ai_governance.changed': {
      qc.invalidateQueries({ queryKey: qk.mcp.aiGovernanceScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.aiGovernanceUseCases(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.aiGovernanceEvents(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.overview(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.evidence(orgId) })
      qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
      qc.invalidateQueries({ queryKey: qk.pulse.feed(orgId), exact: false })
      return
    }

    // AI auto-remediation — engine has finished opening PRs after a scan.
    // Refresh the fix-plan panel + repo profile so the user sees the new
    // "3 PRs opened" chip without refreshing.
    case 'ai_patch.ready': {
      const payload = e.payload as { repo_id?: string } | undefined
      if (payload?.repo_id) {
        qc.invalidateQueries({ queryKey: qk.repos.fixPlan(payload.repo_id) })
        qc.invalidateQueries({ queryKey: qk.repos.profile(payload.repo_id) })
      }
      return
    }

    // 5-phase red team pipeline state-machine events. The pipeline hook
    // doesn't use React Query yet (it has its own imperative loop), so
    // we forward through a module-level emitter — see
    // @lib/cloud/pipelineEvents. Once Phase C ships and the hook turns
    // into a snapshot-+-SSE observer, this branch collapses into a
    // queryClient.setQueryData() flow.
    case 'pipeline_run.created':
    case 'pipeline_run.phase':
    case 'pipeline_run.evidence':
    case 'pipeline_run.finalized': {
      emitPipelineEvent({
        type: t,
        orgId,
        payload: (e.payload ?? {}) as Record<string, unknown>,
      })
      return
    }

    // Footprint Expander — multi-round expansion lifecycle. Every
    // event invalidates the latest-run cache so the running banner
    // updates instantly; entity.found also nudges the graph +
    // timeseries queries so the list / 3D / signal counts move in
    // real time without per-tick polling. round.complete and
    // run.finalized flush everything for the final pass.
    case 'footprint.entity.found': {
      invalidateFootprintProgress(qc, orgId)
      return
    }
    case 'footprint.round.complete': {
      invalidateFootprintClosure(qc, orgId)
      return
    }
    case 'footprint.run.started': {
      invalidateFootprintProgress(qc, orgId)
      return
    }
    case 'footprint.run.finalized': {
      invalidateFootprintClosure(qc, orgId)
      return
    }
    case 'footprint.breakthrough.updated': {
      invalidateFootprintClosure(qc, orgId)
      return
    }

    // Platform pipeline — 3-phase orchestrator:
    // Phase 1 discovery → Phase 2 Footprint → Phase 3 Pentest suggestions.
    // The backend emits generic pipeline.progress events for this flow; dropping
    // them makes the Footprint/Pentest/Domain evidence pages look stale even
    // while the engine is doing useful work.
    case 'pipeline.progress':
    case 'pipeline.complete':
    case 'pipeline.failed': {
      invalidatePlatformPipelineSurfaces(qc, orgId)
      return
    }

    // Workspace / Cortex domain events — flyto-code doesn't render
    // resources / projects / folders, so we deliberately drop them. Listed
    // explicitly so the exhaustiveness check passes; if one of these later
    // becomes meaningful to flyto-code, just move it out of this group.
    case 'resource.created':
    case 'resource.updated':
    case 'resource.deleted':
    case 'project.created':
    case 'project.updated':
    case 'project.deleted':
    case 'folder.created':
    case 'folder.updated':
    case 'folder.deleted':
    case 'activity.logged':
      return

    // Code alert lifecycle. The raw alert list is not the only consumer:
    // Pulse, CTEM priorities, score, verdict/risk/timeline, unified finding
    // drawers and blast graphs all derive from open/resolved alert state.
    case 'alert.created':
    case 'alert.resolved': {
      invalidateAlertSurfaces(qc, orgId, e)
      return
    }

    default:
      // assertExhaustiveEvent only accepts `never`. If this line is
      // reachable, a new EngineEventType was added but not routed —
      // TypeScript will fail to compile until it's handled or
      // explicitly ignored above.
      assertExhaustiveEvent(t)
  }
}
