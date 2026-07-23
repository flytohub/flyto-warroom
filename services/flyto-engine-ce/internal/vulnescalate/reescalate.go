// Package vulnescalate implements the exploitability re-escalation rule —
// the pure decision layer for "should this finding's severity be bumped
// because its CVE got MORE dangerous AFTER we first saw the finding".
//
// THE GAP this closes: a finding's effective_severity + SLA window are
// computed once, at discovery (first_seen), from the exploitability facts
// known at that moment. The exploitability timeline (cve_exploitability +
// epss_history) keeps moving — a CVE can enter the CISA KEV catalog, or its
// EPSS exploit-probability can climb, DAYS or WEEKS after a finding was first
// seen. Nothing re-reads that timeline against an existing finding, so a
// finding discovered as "medium" stays medium forever even once its CVE
// becomes a known-exploited, ransomware-associated, high-EPSS emergency.
//
// This package is the PURE rule. It takes the finding's current state
// (effective severity + first_seen) and the CVE's exploitability facts, and
// returns whether to re-escalate, the new effective severity, and a
// human-readable reason. No I/O, no clock side effects beyond the `now` and
// `firstSeen` the caller passes — deterministic and trivially testable. The
// worker (cmd/worker/vuln_reescalation_loop.go) supplies the facts and
// applies the result (recomputing the SLA clock + persisting).
//
// PRODUCT DECISIONS (flagged for product, all centralised as the constants
// below so they're easy to tune):
//
//   - KEV-entry-after-first-seen → CRITICAL (not "+1 tier"). A CVE entering
//     the CISA Known-Exploited-Vulnerabilities catalog means it is being
//     actively exploited in the wild RIGHT NOW. That is the single loudest
//     exploitability signal we have; we escalate straight to critical rather
//     than nudging one tier, matching how ComputeEffectiveSeverity already
//     treats KEV as the dominant multiplier. (Threshold: KEVEntryTarget.)
//   - EPSS crossing the high threshold after first_seen → +1 tier (bumpOne).
//     EPSS is probabilistic, not a confirmed in-the-wild fact, so a high EPSS
//     bumps one tier rather than jumping to critical. (Threshold:
//     EPSSHighThreshold = 0.50, EPSS bump = single tier.)
//   - Re-escalation NEVER downgrades: if the finding is already at or above
//     the rule's target tier, it's a no-op (idempotent — re-running the sweep
//     never double-bumps and never lowers severity).
//
// SLA-CLOCK decision (applied by the worker, documented here for context):
// the SLA window is recomputed for the NEW (higher) severity but the clock
// still runs from the ORIGINAL first_seen — re-escalation does NOT reset the
// clock. An aged finding that re-escalates may therefore breach immediately,
// which is correct: the CVE has been exploitable-in-the-wild for however long
// the finding has existed; pretending the clock starts now would hide real
// overdue exposure.
package vulnescalate

import (
	"fmt"
	"strings"
	"time"
)

// Product thresholds. Centralised so product can tune them in one place.
const (
	// EPSSHighThreshold is the EPSS score at or above which a CVE is
	// considered "exploit-likely enough to re-escalate". 0.50 = FIRST's
	// own rough "more likely than not to be exploited in the next 30
	// days" inflection. Flagged as product.
	EPSSHighThreshold = 0.50

	// KEVEntryTarget is the effective severity a finding jumps to when its
	// CVE newly enters the KEV catalog after first_seen. KEV = confirmed
	// in-the-wild exploitation → straight to critical.
	KEVEntryTarget = "critical"
)

// ExploitFacts is the per-CVE exploitability snapshot the rule reads. The
// worker fills it from store.GetCVEExploitability (latest KEV+EPSS) plus the
// EPSS history; the rule never touches the store itself.
type ExploitFacts struct {
	// CVEID is informational (used in the reason string).
	CVEID string

	// InKEV / KEVDateAdded mirror cve_exploitability: whether the CVE is in
	// the CISA KEV catalog and the catalog dateAdded ("YYYY-MM-DD"). When
	// InKEV is true but KEVDateAdded is unparseable/empty we treat the KEV
	// listing as "date unknown" and do NOT fire the KEV-entry rule (we
	// can't prove it entered AFTER first_seen, and we never re-escalate on
	// a guess).
	InKEV        bool
	KEVDateAdded string

	// KnownRansomware mirrors cve_exploitability.known_ransomware ("Known"
	// / "Unknown" / ""). Surfaced in the reason when "Known" — it makes the
	// KEV escalation read as the emergency it is.
	KnownRansomware string

	// EPSS is the latest EPSS score (0..1). EPSSAtFirstSeen is the EPSS we
	// can attribute to discovery time — the earliest snapshot captured at
	// or after first_seen (or, when no snapshot predates first_seen, the
	// oldest snapshot we have). Both are filled by the worker from
	// epss_history; when no history exists EPSSAtFirstSeen == EPSS and the
	// EPSS-climb rule can't fire (no movement to point at).
	EPSS            float64
	EPSSAtFirstSeen float64
}

// Decision is the rule's output.
type Decision struct {
	// Reescalate is true when the finding should be bumped. When false the
	// other fields are the unchanged inputs (NewSeverity == current).
	Reescalate bool
	// NewSeverity is the effective severity to persist (== current when not
	// re-escalating). Always one of critical|high|medium|low.
	NewSeverity string
	// Reason is the human-readable explanation, surfaced on the finding +
	// written to the audit history. Empty when not re-escalating.
	Reason string
	// Trigger is a stable machine tag ("kev_entry" | "epss_climb") for the
	// audit row / metrics. Empty when not re-escalating.
	Trigger string
}

// Evaluate is the entire re-escalation rule, pure and deterministic.
//
//	current   — the finding's CURRENT effective severity (critical|high|medium|low).
//	firstSeen — when the finding was first seen (the SLA clock origin).
//	facts     — the CVE's current exploitability snapshot.
//
// It returns a Decision. Idempotent: feeding back a Decision.NewSeverity as
// `current` yields Reescalate=false, so the worker never double-bumps and
// never downgrades (we only ever raise severity).
//
// Rule precedence: KEV-entry (→ critical) dominates EPSS-climb (→ +1 tier),
// because a confirmed in-the-wild listing is a louder signal than a
// probability crossing a threshold. We evaluate KEV first and, only if it
// doesn't apply, fall through to EPSS.
func Evaluate(current string, firstSeen time.Time, facts ExploitFacts) Decision {
	cur := normalizeSeverity(current)
	noChange := Decision{Reescalate: false, NewSeverity: cur}

	// ── Rule 1: CVE newly entered KEV after first_seen → critical. ──────
	// Only fires when we can PROVE the KEV dateAdded is strictly after the
	// finding's first_seen. An unparseable/empty dateAdded, or a KEV
	// listing that predates first_seen (the finding was already born into
	// a KEV CVE — discovery-time decoration already accounted for it),
	// does not fire.
	if facts.InKEV {
		if kevDate, ok := parseKEVDate(facts.KEVDateAdded); ok {
			if !firstSeen.IsZero() && kevDate.After(firstSeen) {
				if severityRank(KEVEntryTarget) < severityRank(cur) {
					// Strictly more severe than current → escalate.
					reason := fmt.Sprintf("exploitability climbing: %s entered KEV %s",
						cveLabel(facts.CVEID), facts.KEVDateAdded)
					if strings.EqualFold(strings.TrimSpace(facts.KnownRansomware), "known") {
						reason += " (known ransomware campaign use)"
					}
					return Decision{
						Reescalate:  true,
						NewSeverity: KEVEntryTarget,
						Reason:      reason,
						Trigger:     "kev_entry",
					}
				}
				// Already critical → KEV-entry is a no-op (never downgrade,
				// never double-bump). Fall through; EPSS can't beat critical
				// either, so this returns noChange.
			}
		}
	}

	// ── Rule 2: EPSS crossed the high threshold after first_seen → +1. ──
	// Fires when the latest EPSS is at/above the threshold AND it was below
	// the threshold at first_seen (i.e. it CLIMBED across the line while we
	// held the finding — not a finding that was already high-EPSS at
	// discovery, which the discovery-time decoration already scored).
	if facts.EPSS >= EPSSHighThreshold && facts.EPSSAtFirstSeen < EPSSHighThreshold {
		target := bumpOne(cur)
		if severityRank(target) < severityRank(cur) {
			reason := fmt.Sprintf("exploitability climbing: %s EPSS %.2f→%.2f (crossed %.2f)",
				cveLabel(facts.CVEID), facts.EPSSAtFirstSeen, facts.EPSS, EPSSHighThreshold)
			return Decision{
				Reescalate:  true,
				NewSeverity: target,
				Reason:      reason,
				Trigger:     "epss_climb",
			}
		}
	}

	return noChange
}

// parseKEVDate parses the CISA KEV "YYYY-MM-DD" dateAdded into a UTC time at
// midnight. Returns ok=false for empty/unparseable input — the caller treats
// that as "KEV date unknown, do not fire" rather than guessing.
func parseKEVDate(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		// Tolerate an RFC3339 / timestamp form too, in case a source ever
		// stamps a full datetime.
		if t2, err2 := time.Parse(time.RFC3339, s); err2 == nil {
			return t2.UTC(), true
		}
		return time.Time{}, false
	}
	return t.UTC(), true
}

func cveLabel(cve string) string {
	c := strings.TrimSpace(cve)
	if c == "" {
		return "CVE"
	}
	return c
}

// normalizeSeverity collapses input to the canonical four-bucket vocabulary,
// defaulting unknowns to "low" (matching ctem.severityWeight's fallback) so
// an odd input never produces an out-of-range severity.
func normalizeSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical":
		return "critical"
	case "high":
		return "high"
	case "medium", "moderate":
		return "medium"
	case "low":
		return "low"
	}
	return "low"
}

// severityRank orders severities (lower = more severe) so we can compare
// "is target strictly more severe than current". Mirrors ctem's internal
// rank but kept package-local so vulnescalate has no dependency on ctem's
// unexported helpers.
func severityRank(s string) int {
	switch normalizeSeverity(s) {
	case "critical":
		return 0
	case "high":
		return 1
	case "medium":
		return 2
	default: // low
		return 3
	}
}

// bumpOne raises a severity by one tier (low→medium→high→critical, critical
// stays). Mirrors ctem.bumpOne.
func bumpOne(s string) string {
	switch normalizeSeverity(s) {
	case "high":
		return "critical"
	case "medium":
		return "high"
	case "low":
		return "medium"
	default: // critical
		return "critical"
	}
}
