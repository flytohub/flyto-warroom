package sla

// aging.go — SLA aging math for the analyst remediation view.
//
// budget.go answers "how many breaches did we burn this quarter".
// This file answers a different question the SOC analyst asks every
// standup: "of everything still open, how OLD is it, and how far
// PAST its SLA deadline has it slipped?". The existing finding rows
// already carry a single boolean breach (ctem.IsBreached) and a
// breach timestamp (sla_breach_at = first_seen_at + SLAHours(sev)).
// What was missing was the *aging curve*: days-open, days-overdue,
// and a bucket distribution so the analyst can triage the long tail.
//
// Pure + I/O-free like budget.go — the caller (api handler) reads
// open external_issue_tracker + code_alerts rows, projects them onto
// FindingAge, and we return the rollup. Keeping it HTTP/store-free
// makes it reusable from a future snapshot worker (deferred this
// slice) and golden-testable.
//
// PRODUCT DEFAULTS (flagged for review):
//   - aging buckets by days-open: 0-7 / 8-30 / 31-90 / 90+
//   - SLA clock starts at first_seen_at (external) / created_at
//     (code_alerts — its first-seen proxy), matching the existing
//     ctem.SLABreachClock(first_seen, SLAHours(sev)) convention.
//   - overdue buckets (for breached findings) by days-past-deadline:
//     0-7 / 8-30 / 31-90 / 90+. Same boundaries, different anchor.

import (
	"math"
	"strings"
	"time"
)

// Aging bucket labels, used for both the open-age distribution and
// the overdue distribution. Stable strings so the UI can key on them.
const (
	BucketAge0to7   = "0-7"
	BucketAge8to30  = "8-30"
	BucketAge31to90 = "31-90"
	BucketAge90plus = "90+"
)

// agingBucketOrder is the canonical render order for the bucket maps.
var agingBucketOrder = []string{BucketAge0to7, BucketAge8to30, BucketAge31to90, BucketAge90plus}

// FindingAge is the minimal slice of a finding row the aging math
// reads. The caller normalises both finding tables onto this shape:
//
//   - external_issue_tracker: Severity, FirstSeenAt, SLABreachAt,
//     Resolved=(resolved_at != nil).
//   - code_alerts: Severity, FirstSeenAt=CreatedAt, SLABreachAt,
//     Resolved=(status != "open").
//
// SLABreachAt is the zero value when no SLA gate was computed for
// the row (legacy rows pre-CTEM, or severity with SLAHours<=0) — we
// treat that as "not breached" rather than guessing.
type FindingAge struct {
	Severity    string
	FirstSeenAt time.Time
	SLABreachAt time.Time // zero = no SLA gate / not yet breached
	Resolved    bool
}

// SeverityAging is the per-severity rollup the analyst view renders
// as a stacked bar: open count, how many are breached/overdue, and
// the age + overdue bucket distributions.
type SeverityAging struct {
	Severity       string         `json:"severity"`
	OpenCount      int            `json:"open_count"`
	BreachedCount  int            `json:"breached_count"`
	OverdueCount   int            `json:"overdue_count"`
	OldestAgeDays  int            `json:"oldest_age_days"`
	AvgAgeDays     float64        `json:"avg_age_days"`
	AgeBuckets     map[string]int `json:"age_buckets"`     // bucket → count (all open)
	OverdueBuckets map[string]int `json:"overdue_buckets"` // bucket → count (breached only)
}

// AgingReport is the full response: per-severity rollups plus org
// totals. Severities are sorted critical → low; buckets within each
// severity are always the four canonical keys (zero-filled) so the
// UI never has to handle a missing key.
type AgingReport struct {
	BySeverity     []SeverityAging `json:"by_severity"`
	TotalOpen      int             `json:"total_open"`
	TotalBreached  int             `json:"total_breached"`
	TotalOverdue   int             `json:"total_overdue"`
	OldestOpenDays int             `json:"oldest_open_days"`
	AvgAgeDays     float64         `json:"avg_age_days"`
	GeneratedAt    time.Time       `json:"generated_at"`
}

// AgeBuckets computes the aging rollup for a set of findings as of
// `now`. Resolved findings are excluded entirely — aging is a
// property of the open backlog. A finding is "breached"/"overdue"
// when it has a non-zero SLABreachAt that `now` has passed; the
// overdue magnitude is now - SLABreachAt. Days are floor'd full
// days (an item first seen 7.9 days ago is in the 0-7 bucket, since
// it has not yet completed its 8th day).
func AgeBuckets(findings []FindingAge, now time.Time) AgingReport {
	// Per-severity accumulators keyed by normalised severity.
	type acc struct {
		open      int
		breached  int
		overdue   int
		oldest    int
		ageSum    int
		ageBucket map[string]int
		ovBucket  map[string]int
	}
	bySev := map[string]*acc{}
	getAcc := func(sev string) *acc {
		a := bySev[sev]
		if a == nil {
			a = &acc{ageBucket: zeroBuckets(), ovBucket: zeroBuckets()}
			bySev[sev] = a
		}
		return a
	}

	var totalOpen, totalBreached, totalOverdue, oldestOpen, ageSumAll int

	for _, f := range findings {
		if f.Resolved {
			continue // aging is the open-backlog property
		}
		sev := normalizeSeverity(f.Severity)
		a := getAcc(sev)

		ageDays := fullDaysBetween(f.FirstSeenAt, now)
		if ageDays < 0 {
			ageDays = 0 // clock skew / future first_seen — clamp
		}

		a.open++
		a.ageSum += ageDays
		if ageDays > a.oldest {
			a.oldest = ageDays
		}
		a.ageBucket[ageBucket(ageDays)]++

		totalOpen++
		ageSumAll += ageDays
		if ageDays > oldestOpen {
			oldestOpen = ageDays
		}

		// Breached/overdue: needs a real SLA gate that now passed.
		if !f.SLABreachAt.IsZero() && now.After(f.SLABreachAt) {
			overdueDays := fullDaysBetween(f.SLABreachAt, now)
			if overdueDays < 0 {
				overdueDays = 0
			}
			a.breached++
			a.overdue++
			a.ovBucket[ageBucket(overdueDays)]++
			totalBreached++
			totalOverdue++
		}
	}

	out := AgingReport{
		TotalOpen:      totalOpen,
		TotalBreached:  totalBreached,
		TotalOverdue:   totalOverdue,
		OldestOpenDays: oldestOpen,
		GeneratedAt:    now,
	}
	if totalOpen > 0 {
		out.AvgAgeDays = round1(float64(ageSumAll) / float64(totalOpen))
	}

	// Emit one row per severity that has open findings, critical
	// first. Buckets are always the four canonical keys (zero-fill
	// already done in getAcc), so the UI keys are stable.
	sevs := make([]string, 0, len(bySev))
	for sev := range bySev {
		sevs = append(sevs, sev)
	}
	sortSeverities(sevs)
	for _, sev := range sevs {
		a := bySev[sev]
		row := SeverityAging{
			Severity:       sev,
			OpenCount:      a.open,
			BreachedCount:  a.breached,
			OverdueCount:   a.overdue,
			OldestAgeDays:  a.oldest,
			AgeBuckets:     a.ageBucket,
			OverdueBuckets: a.ovBucket,
		}
		if a.open > 0 {
			row.AvgAgeDays = round1(float64(a.ageSum) / float64(a.open))
		}
		out.BySeverity = append(out.BySeverity, row)
	}
	return out
}

// zeroBuckets returns a fresh bucket map with all four canonical
// keys present and zero — so JSON output is shape-stable.
func zeroBuckets() map[string]int {
	m := make(map[string]int, len(agingBucketOrder))
	for _, k := range agingBucketOrder {
		m[k] = 0
	}
	return m
}

// ageBucket maps a full-day age (or overdue) magnitude onto a bucket.
// Boundaries are inclusive-low: 0..7 → "0-7", 8..30 → "8-30",
// 31..90 → "31-90", 91+ → "90+". A finding exactly at the boundary
// (e.g. day 7) stays in the lower bucket; day 8 rolls up.
func ageBucket(days int) string {
	switch {
	case days <= 7:
		return BucketAge0to7
	case days <= 30:
		return BucketAge8to30
	case days <= 90:
		return BucketAge31to90
	default:
		return BucketAge90plus
	}
}

// fullDaysBetween returns the number of completed 24h days between
// start and end (floor). Negative if end precedes start.
func fullDaysBetween(start, end time.Time) int {
	if start.IsZero() {
		return 0
	}
	return int(math.Floor(end.Sub(start).Hours() / 24.0))
}

func normalizeSeverity(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "moderate":
		return "medium" // align with ctem.severityWeight aliasing
	case "":
		return "low"
	}
	return s
}

// sortSeverities orders severities critical → high → medium → low,
// then anything else alphabetically — stable, in-place. Small N so
// an insertion sort keeps the sort pkg out of this pure file (same
// convention as budget.go's sortBySeverity).
func sortSeverities(sevs []string) {
	rank := func(s string) int {
		switch s {
		case "critical":
			return 0
		case "high":
			return 1
		case "medium":
			return 2
		case "low":
			return 3
		}
		return 4
	}
	for i := 1; i < len(sevs); i++ {
		for j := i; j > 0; j-- {
			rp, rc := rank(sevs[j-1]), rank(sevs[j])
			if rp < rc || (rp == rc && sevs[j-1] <= sevs[j]) {
				break
			}
			sevs[j-1], sevs[j] = sevs[j], sevs[j-1]
		}
	}
}

func round1(f float64) float64 {
	return math.Round(f*10) / 10
}
