package leakscore

import (
	"testing"
	"time"
)

func TestScoreLeak_Freshness(t *testing.T) {
	now := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)
	day := func(n int) *time.Time { d := now.AddDate(0, 0, -n); return &d }

	cases := []struct {
		name      string
		lastSeen  *time.Time
		plaintext bool
		want      Severity
	}{
		{"fresh ≤30d → high", day(5), false, SeverityHigh},
		{"boundary 30d inclusive → high", day(30), false, SeverityHigh},
		{"31d → medium", day(31), false, SeverityMedium},
		{"mid-range 200d → medium", day(200), false, SeverityMedium},
		{"boundary 365d → medium", day(365), false, SeverityMedium},
		{"old >365d → low", day(366), false, SeverityLow},
		{"nil last-seen → medium (present but undated)", nil, false, SeverityMedium},
		// plaintext bumps one level (capped at high).
		{"old + plaintext → medium", day(400), true, SeverityMedium},
		{"medium + plaintext → high", day(100), true, SeverityHigh},
		{"fresh + plaintext stays high", day(2), true, SeverityHigh},
		{"nil + plaintext → high", nil, true, SeverityHigh},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, reason := ScoreLeak(tc.lastSeen, now, tc.plaintext)
			if got != tc.want {
				t.Errorf("ScoreLeak = %q, want %q", got, tc.want)
			}
			if reason == "" {
				t.Errorf("reason should never be empty for a leak claim")
			}
			if tc.plaintext && got != SeverityNone {
				if want := "plaintext password recovered"; !contains(reason, want) {
					t.Errorf("plaintext reason missing %q: %q", want, reason)
				}
			}
		})
	}
}

// TestFreshnessOf_Decay proves the slice-3 explicit freshness-decay confidence:
// an old (400d) leak carries strictly LOWER confidence-it's-still-live than a
// fresh (3d) one, the buckets line up with the SAME 30/365 windows ScoreLeak
// uses, and an undated leak is FreshnessUnknown (never "fresh", never dropped).
func TestFreshnessOf_Decay(t *testing.T) {
	now := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)
	day := func(n int) *time.Time { d := now.AddDate(0, 0, -n); return &d }

	cases := []struct {
		name     string
		lastSeen *time.Time
		want     Freshness
		wantConf int
	}{
		{"3d ago → fresh", day(3), FreshnessFresh, ConfidenceFresh},
		{"boundary 30d → fresh", day(30), FreshnessFresh, ConfidenceFresh},
		{"31d → recent", day(31), FreshnessRecent, ConfidenceRecent},
		{"boundary 365d → recent", day(365), FreshnessRecent, ConfidenceRecent},
		{"400d ago → stale", day(400), FreshnessStale, ConfidenceStale},
		{"undated → unknown (not fresh)", nil, FreshnessUnknown, ConfidenceUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, conf := FreshnessOf(tc.lastSeen, now)
			if got != tc.want {
				t.Errorf("FreshnessOf bucket = %q, want %q", got, tc.want)
			}
			if conf != tc.wantConf {
				t.Errorf("FreshnessOf confidence = %d, want %d", conf, tc.wantConf)
			}
		})
	}

	// Core decay contract: a 400-day-old leak is LESS confidently live than a
	// 3-day-old one (the slice-3 "low confidence it's still live" signal).
	_, freshConf := FreshnessOf(day(3), now)
	_, oldConf := FreshnessOf(day(400), now)
	if !(freshConf > oldConf) {
		t.Errorf("fresh confidence %d must exceed old confidence %d", freshConf, oldConf)
	}
	// An undated leak is present-but-unrecency-provable: more confident than stale,
	// less than fresh — and explicitly NOT classified fresh.
	if !(ConfidenceFresh > ConfidenceUnknown && ConfidenceUnknown > ConfidenceStale) {
		t.Errorf("confidence ordering broken: fresh %d > unknown %d > stale %d",
			ConfidenceFresh, ConfidenceUnknown, ConfidenceStale)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

func TestScoreLeakedPrincipal_BlastRadius(t *testing.T) {
	now := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)
	fresh := now.AddDate(0, 0, -5) // → HIGH base
	old := now.AddDate(0, 0, -400) // → LOW base
	tt := true
	ff := false

	cases := []struct {
		name       string
		lastSeen   *time.Time
		plaintext  bool
		privileged bool
		external   bool
		mfa        *bool
		want       Severity
	}{
		// Ordinary user: no escalation — pure slice-1 freshness/plaintext.
		{"ordinary fresh → high", &fresh, false, false, false, &tt, SeverityHigh},
		{"ordinary old → low", &old, false, false, false, &tt, SeverityLow},
		// Privileged + external → critical regardless of freshness.
		{"privileged external (old) → critical", &old, false, true, true, &tt, SeverityCritical},
		// Privileged + no MFA (nil = unknown = not proven) → critical.
		{"privileged no-MFA → critical", &old, false, true, false, nil, SeverityCritical},
		{"privileged mfa=false → critical", &old, false, true, false, &ff, SeverityCritical},
		// Privileged WITH proven MFA and internal → not critical, but floored at high.
		{"privileged mfa-true internal old → high floor", &old, false, true, false, &tt, SeverityHigh},
		// External alone → at least high.
		{"external ordinary old → high floor", &old, false, false, true, &tt, SeverityHigh},
		// Base higher than the floor is preserved (no downgrade).
		{"external fresh → high (base)", &fresh, false, false, true, &tt, SeverityHigh},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, reason := ScoreLeakedPrincipal(tc.lastSeen, now, tc.plaintext, tc.privileged, tc.external, tc.mfa)
			if got != tc.want {
				t.Errorf("ScoreLeakedPrincipal = %q, want %q (reason=%q)", got, tc.want, reason)
			}
			if reason == "" {
				t.Errorf("reason should never be empty")
			}
		})
	}
}

// TestScoreDomainLeak_FreshnessOnly proves the slice-5 DOMAIN path: a
// domain-anchored leak sighting is scored STRICTLY by the same 30/365 freshness
// windows as the email path, with NO person blast-radius escalation (a domain has
// no is_privileged / is_external / MFA facts) and NO plaintext bump (the signature
// takes neither). An undated sighting (zero time) is the undated floor (MEDIUM),
// never dropped and never treated as fresh.
func TestScoreDomainLeak_FreshnessOnly(t *testing.T) {
	now := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)
	day := func(n int) time.Time { return now.AddDate(0, 0, -n) }

	cases := []struct {
		name     string
		lastSeen time.Time
		want     Severity
	}{
		{"fresh ≤30d → high", day(5), SeverityHigh},
		{"boundary 30d inclusive → high", day(30), SeverityHigh},
		{"31d → medium", day(31), SeverityMedium},
		{"mid-range 200d → medium", day(200), SeverityMedium},
		{"boundary 365d → medium", day(365), SeverityMedium},
		{"old >365d → low", day(366), SeverityLow},
		{"zero (undated) → medium (present but undated)", time.Time{}, SeverityMedium},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, reason := ScoreDomainLeak(tc.lastSeen, now)
			if got != tc.want {
				t.Errorf("ScoreDomainLeak = %q, want %q (reason=%q)", got, tc.want, reason)
			}
			if reason == "" {
				t.Errorf("reason should never be empty for a domain leak")
			}
			if !contains(reason, "domain") {
				t.Errorf("domain-leak reason should mention domain, got %q", reason)
			}
		})
	}

	// No blast-radius escalation: even the freshest domain sighting tops out at
	// HIGH (the email path's privileged/external CRITICAL has no domain analogue).
	for _, n := range []int{0, 1, 5, 30} {
		if got, _ := ScoreDomainLeak(day(n), now); got == SeverityCritical {
			t.Errorf("domain leak at %dd should never be critical (no person blast radius), got %q", n, got)
		}
	}
}
