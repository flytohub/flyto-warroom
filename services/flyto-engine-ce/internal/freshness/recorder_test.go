package freshness

// recorder_test.go — PR-8C. Unit tests for the freshness recorder's staleness
// logic and its best-effort, non-blocking contract. No store/PG needed: a fake
// in-memory Sink captures what the recorder would persist.

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeSink captures the last upserted State and can be made to error.
type fakeSink struct {
	last  *State
	calls int
	err   error
}

func (f *fakeSink) UpsertFreshness(_ context.Context, st State) error {
	f.calls++
	cp := st
	f.last = &cp
	return f.err
}

func TestComputeStatus_Transitions(t *testing.T) {
	now := time.Date(2026, 6, 2, 12, 0, 0, 0, time.UTC)
	recent := now.Add(-30 * time.Second)
	old := now.Add(-2 * time.Hour)

	cases := []struct {
		name       string
		last       *time.Time
		staleAfter int
		want       string
	}{
		{"never succeeded -> never_seen", nil, 60, StatusNeverSeen},
		{"zero-time success -> never_seen", &time.Time{}, 60, StatusNeverSeen},
		{"no window -> fresh", &recent, 0, StatusFresh},
		{"within window -> fresh", &recent, 60, StatusFresh},
		{"exactly at window edge -> fresh", &recent, 30, StatusFresh},
		{"past window -> stale", &old, 60, StatusStale},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := computeStatus(c.last, c.staleAfter, now); got != c.want {
				t.Fatalf("computeStatus(%v, %d) = %q, want %q", c.last, c.staleAfter, got, c.want)
			}
		})
	}
}

func TestRecordSuccess_MarksFresh(t *testing.T) {
	sink := &fakeSink{}
	RecordSuccess(context.Background(), sink, "org-1", "scanner", "comp-1", time.Hour, "run-9")
	if sink.calls != 1 || sink.last == nil {
		t.Fatalf("expected one upsert, got calls=%d last=%v", sink.calls, sink.last)
	}
	st := sink.last
	if st.StalenessStatus != StatusFresh {
		t.Fatalf("expected fresh, got %q", st.StalenessStatus)
	}
	if st.LastSuccessAt == nil || st.LastAttemptAt == nil {
		t.Fatal("expected both last_success_at and last_attempt_at set on success")
	}
	if st.OrgID != "org-1" || st.Surface != "scanner" || st.Component != "comp-1" {
		t.Fatalf("identity mismatch: %+v", st)
	}
	if st.StaleAfterSeconds != 3600 {
		t.Fatalf("expected staleAfter 3600s, got %d", st.StaleAfterSeconds)
	}
	if st.SourceRunID != "run-9" {
		t.Fatalf("expected source run id threaded, got %q", st.SourceRunID)
	}
}

func TestRecordAttempt_NoSuccessYet_NeverSeen(t *testing.T) {
	sink := &fakeSink{}
	// No prior success, empty status -> derived never_seen; last_success stays nil.
	RecordAttempt(context.Background(), sink, "", "code", "comp-2", time.Minute, nil, "", "run-1")
	if sink.last == nil || sink.last.StalenessStatus != StatusNeverSeen {
		t.Fatalf("expected never_seen, got %+v", sink.last)
	}
	if sink.last.LastSuccessAt != nil {
		t.Fatal("attempt must not set last_success_at")
	}
	if sink.last.LastAttemptAt == nil {
		t.Fatal("attempt must advance last_attempt_at")
	}
}

func TestRecordAttempt_PriorSuccessStale(t *testing.T) {
	sink := &fakeSink{}
	prev := time.Now().UTC().Add(-2 * time.Hour)
	RecordAttempt(context.Background(), sink, "", "external", "comp-3", time.Minute, &prev, "", "run-2")
	if sink.last.StalenessStatus != StatusStale {
		t.Fatalf("expected stale (prior success past window), got %q", sink.last.StalenessStatus)
	}
}

func TestRecordAttempt_ExplicitBlockedStatusHonoured(t *testing.T) {
	sink := &fakeSink{}
	RecordAttempt(context.Background(), sink, "", "mcp", "comp-4", time.Minute, nil, StatusBlocked, "run-3")
	if sink.last.StalenessStatus != StatusBlocked {
		t.Fatalf("expected caller-asserted blocked, got %q", sink.last.StalenessStatus)
	}
}

func TestRecord_BestEffort_NilSinkAndError(t *testing.T) {
	// Nil sink: must not panic, no-op.
	RecordSuccess(context.Background(), nil, "", "scanner", "c", 0, "")
	RecordAttempt(context.Background(), nil, "", "scanner", "c", 0, nil, "", "")

	// Sink error: swallowed, never propagated (no return value to assert; the
	// contract is "does not panic / does not block"). We just exercise the path.
	sink := &fakeSink{err: errors.New("boom")}
	RecordSuccess(context.Background(), sink, "", "scanner", "c", 0, "")
	if sink.calls != 1 {
		t.Fatalf("expected the upsert to be attempted once even though it errors, got %d", sink.calls)
	}

	// Missing identity: no-op (no call).
	empty := &fakeSink{}
	RecordSuccess(context.Background(), empty, "", "", "c", 0, "")
	RecordSuccess(context.Background(), empty, "", "scanner", "", 0, "")
	if empty.calls != 0 {
		t.Fatalf("expected no upsert when surface/component missing, got %d", empty.calls)
	}
}
