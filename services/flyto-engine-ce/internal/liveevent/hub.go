// Package liveevent provides an in-memory, workspace-scoped event hub for
// real-time push notifications.
//
// The Hub fans events out to WebSocket subscribers grouped by workspace ID.
// It is intentionally in-memory — events are ephemeral notifications, not
// durable records. Persistence (audit chain, activity log) remains the
// responsibility of the subsystem that creates the event.
//
// Design choices:
//   - workspace-scoped channels prevent cross-tenant data leakage
//   - sequential uint64 event IDs for client-side ordering / dedup
//   - zero external dependencies — stdlib only
//   - concurrent-safe: multiple goroutines may publish and subscribe
package liveevent

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

// subscriberBufferSize is the per-subscriber event buffer. A slow WebSocket
// writer can fall behind by up to this many events before Publish starts
// dropping (and logging) to protect the publisher goroutine from blocking.
// 256 ≈ a few seconds of normal traffic; tune here if subscribers are known
// to be slow.
const subscriberBufferSize = 256

// EventType is the machine-readable kind string. Keep the set small and
// stable — frontend clients key behaviour off these values.
type EventType string

const (
	// Cortex — knowledge workspace
	EventResourceCreated  EventType = "resource.created"
	EventResourceUpdated  EventType = "resource.updated"
	EventResourceDeleted  EventType = "resource.deleted"
	EventProjectCreated   EventType = "project.created"
	EventProjectUpdated   EventType = "project.updated"
	EventProjectDeleted   EventType = "project.deleted"
	EventFolderCreated    EventType = "folder.created"
	EventFolderUpdated    EventType = "folder.updated"
	EventFolderDeleted    EventType = "folder.deleted"
	EventPipelineProgress EventType = "pipeline.progress"
	EventPipelineComplete EventType = "pipeline.complete"
	EventPipelineFailed   EventType = "pipeline.failed"

	// Code — scanning & alerting
	EventScanQueued   EventType = "scan.queued"
	EventScanRunning  EventType = "scan.running"
	EventScanComplete EventType = "scan.complete"
	EventScanFailed   EventType = "scan.failed"
	// EventScanStalled — published by the stalled-scan sweep worker
	// when a queued/running row's started_at is older than the
	// freshness threshold (engine crash, dropped scan.complete,
	// worker pod restart). Frontend treats it like scan.failed for
	// the purpose of invalidating ['repo-scans', repo_id] / the
	// pentest equivalent, but renders a distinct "Stalled" badge
	// with a "Retry" affordance instead of an error message.
	EventScanStalled   EventType = "scan.stalled"
	EventAlertCreated  EventType = "alert.created"
	EventAlertResolved EventType = "alert.resolved"

	// Code — domain-specific scan completion. Published once a domain's
	// scan + scoring finishes so the frontend can invalidate the matching
	// posture/findings query keys without waiting for staleTime. Workspace
	// bucket = org_id; payload {org_id}.
	//
	// EventContainerScanComplete: FE invalidates container posture + findings
	// EventCloudScanComplete:     FE invalidates cloud posture + cspm findings
	// EventIdentityScanComplete:  FE invalidates identity posture
	EventContainerScanComplete EventType = "container.scan.complete"
	EventCloudScanComplete     EventType = "cloud.scan.complete"
	EventIdentityScanComplete  EventType = "identity.scan.complete"

	// Integration health — fired when probeGitHub detects an
	// expired or missing GitHub credential. Frontend uses this
	// to instantly raise the IntegrationHealthBanner without
	// waiting for the next health-probe poll.
	EventIntegrationExpired EventType = "integration.expired"

	// Code — attack-surface discovery. Published per-step as each scanner
	// completes so the frontend can refresh individual tiles without
	// waiting for the whole fan-out. asset_type in the payload tells the
	// client which tab to invalidate (ssl_cert / tech_stack / whois / …).
	EventDiscoveryStarted  EventType = "discovery.started"
	EventDiscoveryStep     EventType = "discovery.step"
	EventDiscoveryComplete EventType = "discovery.complete"

	// EventDiscoveryStepFailed — published when a per-asset scanner
	// goroutine panics or its outer timeout cancels it before it can
	// write a row. Without this the UI shows partial data with no
	// "we tried but failed" signal. Payload: {project_id, domain,
	// asset_type, reason}.
	EventDiscoveryStepFailed EventType = "discovery.step_failed"

	// EventDiscoveryTruncated — published when the per-subdomain
	// cascade is capped (e.g. domain has 50 subdomains, we only run
	// the cascade on the first 8). Payload: {project_id, domain,
	// total_subdomains, cascaded}. UI shows a "we scanned N of M"
	// badge so operators know to manually trigger a cascade for the
	// rest if they want them covered.
	EventDiscoveryTruncated EventType = "discovery.truncated"

	// Code — continuous monitoring change detection.
	EventDiscoveryChanges EventType = "discovery.changes"

	// Code — score transition monitoring. Published after an alert-worthy
	// score transition is durably saved to monitoring_events so open
	// scoring/Pulse/posture surfaces refresh without polling.
	EventScoreChanged EventType = "score.changed"

	// Code — capability snapshot changed for an org. Published after
	// entitlement, project type, or membership role mutations that can change
	// GET /api/v1/me/capabilities. Frontend invalidates capability-driven
	// route/nav/settings caches immediately instead of showing stale gates.
	EventCapabilitiesChanged EventType = "capabilities.changed"

	// Code — closed-loop verification.
	EventVerifyDispatched EventType = "verify.dispatched"
	EventVerifyTerminal   EventType = "verify.terminal"

	// Code — AI auto-remediation. Published after a scan completes and
	// the AI has opened draft PRs for top findings, so the UI can show
	// "AI-generated PR" links without polling. Payload: pr_urls [].
	EventAIPatchReady EventType = "ai_patch.ready"

	// Code — AutoFix. Published after a Tier 1/2 run completes and
	// findings are persisted so the UI can refresh the AutoFix count
	// badge without manual page reload.
	EventAutofixComplete EventType = "autofix.complete"

	// Code — cross-surface remediation. Published after target/plan/run
	// lifecycle transitions so AutoFix, cloud, container, runtime, and external
	// cockpits can refresh without polling.
	EventRemediationChanged EventType = "remediation.changed"

	// Code — MCP Runtime Guardian. Published after an MCP call attempt is
	// decided + recorded, whether it arrived from the external MCP proxy's
	// API-key ingest path or from the dashboard's test-connection action.
	// Frontend refreshes overview/egress so open pages reflect live agent
	// traffic without polling.
	EventMCPEventIngested EventType = "mcp.event.ingested"

	// Code — AI Governance lifecycle/runtime closure. Published when the
	// use-case register changes or the governance overlay records a runtime gap,
	// hold, or block so open governance pages can invalidate without polling.
	EventAIGovernanceChanged EventType = "ai_governance.changed"

	// Shared — audit & activity
	EventActivityLogged EventType = "activity.logged"
	// Enterprise — edition boundary and immutable audit ledger. Published after
	// an enterprise audit row is appended so admin pages refresh profile/audit
	// evidence without polling. Payload: {org_id, action, surface, outcome}.
	EventEnterpriseAuditLogged EventType = "enterprise.audit.logged"
	// Enterprise — license or entitlement transition recorded in the enterprise
	// audit ledger. Payload matches EventEnterpriseAuditLogged.
	EventLicenseUpdated EventType = "license.updated"

	// Code — red team campaign budget breach. Published per-org when
	// a CampaignBudgetPolicy threshold is crossed. Payload includes
	// incident_id, policy_id, threshold_type ("soft"|"hard"), metric,
	// observed, limit. UI surfaces as a banner in the war room.
	EventCampaignBudgetBreach EventType = "campaign_budget.breach"

	// Code — red team campaign execution state transition pushed by
	// the runner via /runner/executions/callback. Lets the UI stop
	// polling — subscribing to this stream is enough to see every
	// queued → running → complete|failed transition within ~1 s.
	// Payload: campaign_execution_id, runner_execution_id, status,
	// verdict?, findings_count?, critical_count?.
	EventCampaignExecutionUpdated EventType = "campaign_execution.updated"

	// Code — 5-phase red team pipeline state machine. Phase A of the
	// browser→engine orchestrator migration emits these from the log
	// handlers; Phase C will emit them from the engine-side goroutine
	// directly. Workspace bucket = org_id.
	//
	// EventPipelineRunCreated:  payload {run_id, campaign_id, target_url}
	// EventPipelinePhase:       payload {run_id, phase, status, summary?,
	//                                    next_action?, input_tokens, output_tokens}
	// EventPipelineEvidence:    payload {run_id, phase, url, method,
	//                                    status_code?, execution_id?}
	// EventPipelineRunFinalized: payload {run_id, status, risk_level?,
	//                                     proven_count, flaky_count,
	//                                     total_input_tokens, total_output_tokens,
	//                                     error?}
	EventPipelineRunCreated   EventType = "pipeline_run.created"
	EventPipelinePhase        EventType = "pipeline_run.phase"
	EventPipelineEvidence     EventType = "pipeline_run.evidence"
	EventPipelineRunFinalized EventType = "pipeline_run.finalized"

	// Code — Footprint Expander multi-round expansion. Workspace
	// bucket = org_id, payloads carry the live run snapshot so the
	// frontend can render Round X/Y + entities/tokens/sources
	// without re-fetching latest-run on every tick.
	//
	// EventFootprintRunStarted:    payload {run_id, max_depth, max_entities}
	// EventFootprintEntityFound:   payload {entity_id, type, canonical_name, source, score, tier, depth}
	// EventFootprintRoundComplete: payload {round, entities, tokens_harvested, sources_active}
	// EventFootprintRunFinalized:  payload {run_id, status, stop_reason, entities, relationships, rounds, tokens}
	EventFootprintRunStarted          EventType = "footprint.run.started"
	EventFootprintEntityFound         EventType = "footprint.entity.found"
	EventFootprintRoundComplete       EventType = "footprint.round.complete"
	EventFootprintRunFinalized        EventType = "footprint.run.finalized"
	EventFootprintBreakthroughUpdated EventType = "footprint.breakthrough.updated"

	// Convergence pass 2026-06-10 — close SSE gaps the war-room loop audit
	// surfaced. Each is published on the same code path as the state write so
	// open pages refresh without waiting for staleTime. Workspace bucket =
	// org_id unless noted.

	// EventIssueStatusChanged — code-issue lifecycle (snooze/ignore/solve).
	// Published after UpsertIssueStatus. FE invalidates enriched issues +
	// autofix findings. Payload: {org_id, fingerprint, status}.
	EventIssueStatusChanged EventType = "issue.status_changed"

	// EventExternalIssueUpdated — external CTEM issue state change
	// (mark-fixed / assign / verify). Published after the handlers_ctem
	// status mutations. FE invalidates ctem priorities + external posture.
	// Payload: {org_id, issue_id, action}.
	EventExternalIssueUpdated EventType = "external_issue.updated"

	// EventFindingLifecycle — durable finding history changed. Published
	// after created/reconfirmed/field_changed/commented/resolved/
	// verified_fixed/reopened/superseded writes so CTEM pages refresh
	// their list, drawer, footprint overlay and manager rollups without
	// waiting for staleTime. Payload:
	// {org_id, finding_id, fingerprint, action, source, occurred_at}.
	EventFindingLifecycle EventType = "finding.lifecycle"

	// EventCompanyScopeUpdated — company/business-scope graph changed
	// (holding company, subsidiary, brand, app, declared seed assets).
	// FE invalidates Footprint, Asset Coverage, Brand Protection, CTEM,
	// findings, report and score surfaces from the same Resource Kernel
	// source of truth. Payload: {org_id, source, scope_mode, entities,
	// assets, relationships}.
	EventCompanyScopeUpdated EventType = "company_scope.updated"

	// EventThreatIntelRefresh — global catalog refresh (MITRE actors/malware,
	// ransomware.live) landed new rows. Broadcast to all orgs so open
	// threat-intel pages refresh. Payload: {catalog, count}.
	EventThreatIntelRefresh EventType = "threatintel.refresh"

	// EventRepoConnected / EventRepoDisconnected — asset ingest signal so a
	// second war-room tab sees the connect/disconnect without staleTime.
	// Payload: {org_id, repo_id}.
	EventRepoConnected    EventType = "repo.connected"
	EventRepoDisconnected EventType = "repo.disconnected"

	// EventPentestProjectCreated / EventPentestProjectDeleted — pentest
	// project lifecycle (distinct from Cortex project.* events). Payload:
	// {org_id, project_id}.
	EventPentestProjectCreated EventType = "pentest_project.created"
	EventPentestProjectDeleted EventType = "pentest_project.deleted"

	// EventRuntimeEvent — runtime SDK telemetry landed. FE invalidates the
	// runtime view. Payload: {org_id}.
	EventRuntimeEvent EventType = "runtime.event"
)

// Event is the envelope pushed to WebSocket subscribers.
type Event struct {
	ID          uint64         `json:"id"`
	WorkspaceID string         `json:"workspaceId"`
	Type        EventType      `json:"type"`
	Payload     map[string]any `json:"payload,omitempty"`
	Timestamp   time.Time      `json:"timestamp"`
}

// MarshalEvent serialises an Event to JSON. Returns nil on error (callers
// should log but not crash — a single bad event must not take down the hub).
func MarshalEvent(e Event) []byte {
	b, err := json.Marshal(e)
	if err != nil {
		return nil
	}
	return b
}

// Subscriber is the callback shape. Implementations must not block — if
// the WebSocket write buffer is full the subscriber should drop or queue
// internally.
type Subscriber func(Event)

// subscription pairs a subscriber with its delivery goroutine.
// Events are queued on ch and drained by a single worker goroutine that
// invokes fn, so a slow callback never blocks Publish.
type subscription struct {
	id        uint64
	fn        Subscriber
	ch        chan Event
	done      chan struct{}
	mu        sync.RWMutex
	closed    bool
	closeOnce sync.Once
}

func (s *subscription) enqueue(e Event) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.closed {
		return true
	}
	select {
	case s.ch <- e:
		return true
	default:
		return false
	}
}

func (s *subscription) stop() {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		if !s.closed {
			s.closed = true
			close(s.ch)
		}
		s.mu.Unlock()
	})
	<-s.done
}

// Hub is the central event bus. Create one per process via NewHub and share
// it across the api.Server, pipeline, and worker packages.
type Hub struct {
	mu    sync.RWMutex
	subs  map[string][]*subscription // workspace → subscribers
	seq   atomic.Uint64              // global event counter
	subC  atomic.Uint64              // subscription ID counter
	dropC atomic.Uint64              // total events dropped because subscriber buffers were full
	// Cross-pod fan-out — wired at boot via SetBridge.
	bridgeMu sync.RWMutex
	bridge   *PGBridge
}

// NewHub returns a ready-to-use Hub.
func NewHub() *Hub {
	return &Hub{
		subs: make(map[string][]*subscription),
	}
}

// Subscribe registers fn for events scoped to workspaceID. Returns an
// unsubscribe function that the caller must invoke on connection close.
// A single delivery goroutine is started per subscription; it drains a
// bounded buffer and invokes fn. Unsubscribe closes the buffer and waits
// for the worker to exit, so callers don't accidentally race with fn.
func (h *Hub) Subscribe(workspaceID string, fn Subscriber) (unsubscribe func()) {
	id := h.subC.Add(1)
	s := &subscription{
		id:   id,
		fn:   fn,
		ch:   make(chan Event, subscriberBufferSize),
		done: make(chan struct{}),
	}

	go func() {
		defer close(s.done)
		for e := range s.ch {
			fn(e)
		}
	}()

	h.mu.Lock()
	h.subs[workspaceID] = append(h.subs[workspaceID], s)
	h.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			h.mu.Lock()
			list := h.subs[workspaceID]
			for i, sub := range list {
				if sub.id == id {
					h.subs[workspaceID] = append(list[:i], list[i+1:]...)
					break
				}
			}
			if len(h.subs[workspaceID]) == 0 {
				delete(h.subs, workspaceID)
			}
			h.mu.Unlock()

			s.stop()
		})
	}
}

// Publish fans an event out to all subscribers for the given workspace.
// Each subscriber has its own bounded buffer; Publish does a non-blocking
// send and drops (with a warning log) on overflow rather than blocking or
// spawning unbounded goroutines. This protects the hub from slow WebSocket
// writers that would otherwise starve other subscribers of the same tenant.
func (h *Hub) Publish(workspaceID string, eventType EventType, payload map[string]any) {
	e := Event{
		ID:          h.seq.Add(1),
		WorkspaceID: workspaceID,
		Type:        eventType,
		Payload:     payload,
		Timestamp:   time.Now().UTC(),
	}
	h.publishLocal(e)
	// Cross-pod fan-out via PG NOTIFY if bridge wired.
	if br := h.getBridge(); br != nil {
		br.Publish(context.Background(), e)
	}
}

// publishLocal — deliver event to in-process subscribers only.
// Called by Publish AND by PGBridge.relayInbound to avoid loops.
func (h *Hub) publishLocal(e Event) {
	h.mu.RLock()
	list := make([]*subscription, len(h.subs[e.WorkspaceID]))
	copy(list, h.subs[e.WorkspaceID])
	h.mu.RUnlock()

	for _, s := range list {
		if ok := s.enqueue(e); !ok {
			h.dropC.Add(1)
			slog.Warn("liveevent: subscriber buffer full, dropping event",
				"workspace", e.WorkspaceID, "event", string(e.Type), "sub_id", s.id)
		}
	}
}

// SetBridge wires an optional cross-pod PG bridge. Idempotent;
// pass nil to disable. Called once at server / worker boot.
func (h *Hub) SetBridge(b *PGBridge) {
	h.bridgeMu.Lock()
	h.bridge = b
	h.bridgeMu.Unlock()
}

func (h *Hub) getBridge() *PGBridge {
	h.bridgeMu.RLock()
	defer h.bridgeMu.RUnlock()
	return h.bridge
}

// Close disconnects every active subscriber and waits for their delivery
// goroutines to exit. After Close returns, further Publish calls are no-ops
// (no subscribers) but will not panic. Intended for graceful process
// shutdown — individual connections should still unsubscribe themselves on
// WebSocket close to avoid relying on process teardown.
func (h *Hub) Close() {
	h.mu.Lock()
	all := make([]*subscription, 0)
	for _, list := range h.subs {
		all = append(all, list...)
	}
	h.subs = make(map[string][]*subscription)
	h.mu.Unlock()

	for _, s := range all {
		s.stop()
	}
}

// SubscriberCount returns the number of active subscribers for a workspace.
// Useful for health checks and diagnostics.
func (h *Hub) SubscriberCount(workspaceID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[workspaceID])
}

// TotalSubscribers returns the total number of active subscribers across
// all workspaces.
func (h *Hub) TotalSubscribers() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	total := 0
	for _, list := range h.subs {
		total += len(list)
	}
	return total
}

// DroppedEvents returns the cumulative number of events discarded because
// subscriber buffers were full. It is intentionally process-local; operators
// should scrape all pods and sum the counter for the platform-wide rate.
func (h *Hub) DroppedEvents() uint64 {
	if h == nil {
		return 0
	}
	return h.dropC.Load()
}
