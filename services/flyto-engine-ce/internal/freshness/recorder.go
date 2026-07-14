// Package freshness is the PR-8C freshness recorder: the ONE place that decides
// a producer's staleness_status and upserts a data_freshness_states row. It is
// the writer-side counterpart to the store's data_freshness_states table.
//
// SAFETY CONTRACT (the whole point of this slice):
//   - ADDITIVE + BEST-EFFORT. Every recording call swallows its error
//     (slog.Warn) and returns nothing. A freshness write must NEVER block,
//     delay, or change the outcome of the caller's real work. A nil sink, a nil
//     context, or a store error are all silent no-ops from the caller's view.
//   - Staleness is computed in exactly ONE function (computeStatus) so the
//     fresh/stale/never_seen transition has a single definition.
//
// Dependency-light: this package does NOT import internal/store. It defines a
// tiny Sink interface (mirroring scanregistry.RunLedgerSink's decoupling
// pattern) that the worker/api wiring implements over the store. This keeps the
// recorder free of any store import cycle and usable from surface packages.
package freshness

import (
	"context"
	"log/slog"
	"time"
)

// Closed-set staleness_status values. These MIRROR store.Staleness* (and the
// migration 070 CHECK) but are duplicated here so the recorder has no store
// dependency. The Sink implementation maps these strings onto the store model.
const (
	StatusFresh     = "fresh"
	StatusStale     = "stale"
	StatusNeverSeen = "never_seen"
	StatusBlocked   = "blocked"
	StatusDisabled  = "disabled"
	StatusUnknown   = "unknown"
)

// State is the recorder's view of one freshness row to upsert. It mirrors the
// store.DataFreshnessState fields the recorder sets, with no store import.
type State struct {
	OrgID             string // "" = platform/system-wide (NULL org)
	Surface           string // code | external | container | cloud | mcp | reports | scanner
	Component         string // producer within the surface (e.g. scanner id)
	LastSuccessAt     *time.Time
	LastAttemptAt     *time.Time
	StalenessStatus   string // closed set: see Status*
	StaleAfterSeconds int
	SourceJobID       string
	SourceRunID       string
	Detail            string
}

// Sink is the narrow write target the recorder needs. The worker/api wiring
// implements it over store.UpsertDataFreshnessState. Keeping it tiny avoids a
// store import cycle and lets surface packages record freshness without pulling
// in the full store interface (mirrors scanregistry.RunLedgerSink).
type Sink interface {
	// UpsertFreshness persists one freshness row. Implementations are
	// best-effort and may return an error; the recorder logs and swallows it.
	UpsertFreshness(ctx context.Context, st State) error
}

// computeStatus is the SINGLE definition of the fresh/stale/never_seen rule:
//
//   - no successful run yet            -> never_seen
//   - staleAfter <= 0 (no window)      -> fresh (any recorded success counts)
//   - now - lastSuccess <= window      -> fresh
//   - otherwise                        -> stale
//
// blocked/disabled/unknown are caller-asserted states, not derived here.
func computeStatus(lastSuccess *time.Time, staleAfterSeconds int, now time.Time) string {
	if lastSuccess == nil || lastSuccess.IsZero() {
		return StatusNeverSeen
	}
	if staleAfterSeconds <= 0 {
		return StatusFresh
	}
	window := time.Duration(staleAfterSeconds) * time.Second
	if now.Sub(*lastSuccess) <= window {
		return StatusFresh
	}
	return StatusStale
}

// RecordSuccess records a SUCCESSFUL run of (orgID, surface, component) as of
// now, with the given freshness window and producing run id. It marks both
// last_success_at and last_attempt_at = now and derives staleness_status
// (always `fresh` for a just-recorded success unless staleAfter is negative).
// Best-effort: any sink error is logged and swallowed; nil sink/ctx is a no-op.
func RecordSuccess(ctx context.Context, sink Sink, orgID, surface, component string, staleAfter time.Duration, sourceRunID string) {
	if sink == nil || ctx == nil || surface == "" || component == "" {
		return
	}
	now := time.Now().UTC()
	staleSecs := int(staleAfter / time.Second)
	st := State{
		OrgID:             orgID,
		Surface:           surface,
		Component:         component,
		LastSuccessAt:     &now,
		LastAttemptAt:     &now,
		StaleAfterSeconds: staleSecs,
		StalenessStatus:   computeStatus(&now, staleSecs, now),
		SourceJobID:       component,
		SourceRunID:       sourceRunID,
	}
	if err := sink.UpsertFreshness(ctx, st); err != nil {
		slog.Warn("freshness: RecordSuccess upsert failed (best-effort, ignored)",
			"surface", surface, "component", component, "err", err)
	}
}

// RecordAttempt records a NON-success attempt (failed/skipped/blocked) of
// (orgID, surface, component) as of now. It advances last_attempt_at but NOT
// last_success_at, so freshness is judged against the prior success. The caller
// passes the resulting status (one of Status*, e.g. StatusBlocked for a gated
// producer, or StatusStale/StatusNeverSeen to assert a derived state). When
// status is empty it is derived from prevSuccess vs staleAfter so a plain
// "attempt happened" call still lands a sane closed-set value.
//
// Best-effort: any sink error is logged and swallowed; nil sink/ctx is a no-op.
func RecordAttempt(ctx context.Context, sink Sink, orgID, surface, component string, staleAfter time.Duration, prevSuccess *time.Time, status, sourceRunID string) {
	if sink == nil || ctx == nil || surface == "" || component == "" {
		return
	}
	now := time.Now().UTC()
	staleSecs := int(staleAfter / time.Second)
	if status == "" {
		status = computeStatus(prevSuccess, staleSecs, now)
	}
	st := State{
		OrgID:             orgID,
		Surface:           surface,
		Component:         component,
		LastSuccessAt:     prevSuccess,
		LastAttemptAt:     &now,
		StaleAfterSeconds: staleSecs,
		StalenessStatus:   status,
		SourceJobID:       component,
		SourceRunID:       sourceRunID,
	}
	if err := sink.UpsertFreshness(ctx, st); err != nil {
		slog.Warn("freshness: RecordAttempt upsert failed (best-effort, ignored)",
			"surface", surface, "component", component, "err", err)
	}
}
