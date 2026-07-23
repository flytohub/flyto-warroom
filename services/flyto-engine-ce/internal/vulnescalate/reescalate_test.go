package vulnescalate

import (
	"strings"
	"testing"
	"time"
)

func ts(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

// KEV entered AFTER first_seen → re-escalate straight to critical.
func TestEvaluate_KEVEntryAfterFirstSeen_Critical(t *testing.T) {
	d := Evaluate("medium", ts("2026-05-01"), ExploitFacts{
		CVEID:        "CVE-2026-1000",
		InKEV:        true,
		KEVDateAdded: "2026-06-01",
	})
	if !d.Reescalate {
		t.Fatalf("expected re-escalation when KEV entered after first_seen")
	}
	if d.NewSeverity != "critical" {
		t.Errorf("KEV-entry should jump to critical, got %q", d.NewSeverity)
	}
	if d.Trigger != "kev_entry" {
		t.Errorf("trigger = %q, want kev_entry", d.Trigger)
	}
	if !strings.Contains(d.Reason, "entered KEV 2026-06-01") {
		t.Errorf("reason missing KEV date: %q", d.Reason)
	}
}

// Known-ransomware KEV listing surfaces in the reason.
func TestEvaluate_KEVEntry_RansomwareInReason(t *testing.T) {
	d := Evaluate("high", ts("2026-05-01"), ExploitFacts{
		CVEID:           "CVE-2026-1001",
		InKEV:           true,
		KEVDateAdded:    "2026-06-01",
		KnownRansomware: "Known",
	})
	if !d.Reescalate || d.NewSeverity != "critical" {
		t.Fatalf("expected critical re-escalation, got %+v", d)
	}
	if !strings.Contains(strings.ToLower(d.Reason), "ransomware") {
		t.Errorf("known-ransomware should appear in reason: %q", d.Reason)
	}
}

// KEV dateAdded BEFORE first_seen → finding was already born into a KEV CVE;
// discovery-time decoration handled it; no re-escalation.
func TestEvaluate_KEVBeforeFirstSeen_NoChange(t *testing.T) {
	d := Evaluate("medium", ts("2026-06-01"), ExploitFacts{
		CVEID:        "CVE-2026-1002",
		InKEV:        true,
		KEVDateAdded: "2026-05-01",
	})
	if d.Reescalate {
		t.Fatalf("KEV predating first_seen must not re-escalate: %+v", d)
	}
	if d.NewSeverity != "medium" {
		t.Errorf("severity should be unchanged medium, got %q", d.NewSeverity)
	}
}

// Empty / unparseable KEV date → cannot prove entry after first_seen → no fire.
func TestEvaluate_KEVDateUnknown_NoChange(t *testing.T) {
	for _, bad := range []string{"", "not-a-date", "2026/06/01"} {
		d := Evaluate("low", ts("2026-05-01"), ExploitFacts{
			CVEID: "CVE-2026-1003", InKEV: true, KEVDateAdded: bad,
		})
		if d.Reescalate {
			t.Errorf("KEVDateAdded=%q should not re-escalate (date unprovable)", bad)
		}
	}
}

// EPSS climbed across the high threshold after first_seen → +1 tier.
func TestEvaluate_EPSSClimb_BumpOneTier(t *testing.T) {
	d := Evaluate("medium", ts("2026-05-01"), ExploitFacts{
		CVEID:           "CVE-2026-2000",
		EPSS:            0.71,
		EPSSAtFirstSeen: 0.12,
	})
	if !d.Reescalate {
		t.Fatalf("expected re-escalation on EPSS climb")
	}
	if d.NewSeverity != "high" { // medium +1 = high (NOT critical)
		t.Errorf("EPSS climb should bump one tier medium→high, got %q", d.NewSeverity)
	}
	if d.Trigger != "epss_climb" {
		t.Errorf("trigger = %q, want epss_climb", d.Trigger)
	}
	if !strings.Contains(d.Reason, "0.12") || !strings.Contains(d.Reason, "0.71") {
		t.Errorf("reason should show the EPSS movement: %q", d.Reason)
	}
}

// EPSS already high at first_seen (no climb) → discovery decoration already
// scored it; no re-escalation even though current EPSS is high.
func TestEvaluate_EPSSAlreadyHighAtFirstSeen_NoChange(t *testing.T) {
	d := Evaluate("high", ts("2026-05-01"), ExploitFacts{
		CVEID:           "CVE-2026-2001",
		EPSS:            0.80,
		EPSSAtFirstSeen: 0.65, // already above 0.50 at discovery
	})
	if d.Reescalate {
		t.Fatalf("no climb across threshold → must not re-escalate: %+v", d)
	}
}

// EPSS climbed but stayed below the threshold → no fire.
func TestEvaluate_EPSSBelowThreshold_NoChange(t *testing.T) {
	d := Evaluate("low", ts("2026-05-01"), ExploitFacts{
		CVEID: "CVE-2026-2002", EPSS: 0.40, EPSSAtFirstSeen: 0.05,
	})
	if d.Reescalate {
		t.Fatalf("EPSS below %.2f must not re-escalate: %+v", EPSSHighThreshold, d)
	}
}

// Stable CVE (no KEV, flat EPSS) → no change.
func TestEvaluate_StableCVE_NoChange(t *testing.T) {
	d := Evaluate("medium", ts("2026-05-01"), ExploitFacts{
		CVEID: "CVE-2026-3000", InKEV: false, EPSS: 0.10, EPSSAtFirstSeen: 0.10,
	})
	if d.Reescalate {
		t.Fatalf("stable CVE must not re-escalate: %+v", d)
	}
	if d.NewSeverity != "medium" {
		t.Errorf("severity unchanged, got %q", d.NewSeverity)
	}
}

// Already-critical finding never double-bumps regardless of signal.
func TestEvaluate_AlreadyCritical_NoDoubleBump(t *testing.T) {
	// KEV entry on an already-critical finding.
	d := Evaluate("critical", ts("2026-05-01"), ExploitFacts{
		CVEID: "CVE-2026-4000", InKEV: true, KEVDateAdded: "2026-06-01",
	})
	if d.Reescalate {
		t.Errorf("already-critical KEV entry must be a no-op: %+v", d)
	}
	// EPSS climb on an already-critical finding.
	d2 := Evaluate("critical", ts("2026-05-01"), ExploitFacts{
		CVEID: "CVE-2026-4001", EPSS: 0.95, EPSSAtFirstSeen: 0.10,
	})
	if d2.Reescalate {
		t.Errorf("already-critical EPSS climb must be a no-op: %+v", d2)
	}
}

// Idempotency: feeding the Decision's output back as `current` is a no-op.
func TestEvaluate_Idempotent(t *testing.T) {
	first := ts("2026-05-01")
	facts := ExploitFacts{CVEID: "CVE-2026-5000", InKEV: true, KEVDateAdded: "2026-06-01"}
	d1 := Evaluate("low", first, facts)
	if !d1.Reescalate || d1.NewSeverity != "critical" {
		t.Fatalf("first pass should escalate low→critical, got %+v", d1)
	}
	d2 := Evaluate(d1.NewSeverity, first, facts)
	if d2.Reescalate {
		t.Errorf("second pass with the new severity must be a no-op: %+v", d2)
	}
}

// KEV precedence: when BOTH a KEV entry and an EPSS climb apply, KEV wins
// (→ critical, not +1 tier).
func TestEvaluate_KEVBeatsEPSS(t *testing.T) {
	d := Evaluate("medium", ts("2026-05-01"), ExploitFacts{
		CVEID:        "CVE-2026-6000",
		InKEV:        true,
		KEVDateAdded: "2026-06-01",
		EPSS:         0.90, EPSSAtFirstSeen: 0.10,
	})
	if !d.Reescalate || d.NewSeverity != "critical" || d.Trigger != "kev_entry" {
		t.Errorf("KEV should dominate EPSS → critical/kev_entry, got %+v", d)
	}
}
