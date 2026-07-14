package sla

// Package sla — SRE-style error-budget math for the SLAMonitor view.
//
// The SLAMonitor surfaces a per-(org, severity) error budget:
// "Critical findings: 2 breaches allowed per quarter, 1 used,
// 50% remaining". This package is the pure-math layer that turns
// store.SLAPolicy rows + existing finding lifecycles
// (external_issue_tracker.sla_breach_at, code_alerts.sla_breach_at)
// into the BudgetUsage shape the UI consumes.
//
// Why a separate package: the policy CRUD lives in the API handler
// layer, but the math is reusable from worker loops (alert when
// budget crosses alert_at_percent), the executive report (board
// summary), and future Slack-bot integrations. Keep it free of
// HTTP/store types so callers wire whatever data source they have.

import (
	"strings"
	"time"
)

// Breach is one finding that crossed its SLA deadline. Caller
// translates ExternalIssueTracker + CodeAlert rows into this shape;
// the math layer doesn't care about the source.
type Breach struct {
	ID         string
	Severity   string     // critical | high | medium | low
	BreachAt   time.Time  // when SLA was first crossed (sla_breach_at)
	ResolvedAt *time.Time // nil if still open
}

// PolicyInput is the minimal slice of store.SLAPolicy the math
// layer reads. AllowedBreaches=0 is a valid input (means "no
// breaches tolerated"); IsActive=false short-circuits the row.
type PolicyInput struct {
	Severity        string
	AllowedBreaches int
	WindowDays      int
	AlertAtPercent  int
	IsActive        bool
}

// BudgetUsage is one row in the SLAMonitor budget panel. Status
// rules:
//   - no_policy   : operator hasn't declared a policy for this
//     severity. UI renders a "set policy" CTA.
//   - inactive    : policy exists but IsActive=false.
//   - healthy     : breaches used < alert_at_percent of allowed.
//   - warning     : used >= alert_at_percent, but < allowed.
//   - exhausted   : used >= allowed. Operator is over budget;
//     every additional breach is a regression.
type BudgetUsage struct {
	Severity          string    `json:"severity"`
	AllowedBreaches   int       `json:"allowed_breaches"`
	UsedBreaches      int       `json:"used_breaches"`
	RemainingBreaches int       `json:"remaining_breaches"`
	UsedPercent       float64   `json:"used_percent"`
	WindowStart       time.Time `json:"window_start"`
	WindowEnd         time.Time `json:"window_end"`
	AlertAtPercent    int       `json:"alert_at_percent"`
	Status            string    `json:"status"`
}

// ComputeUsage produces one BudgetUsage row per declared policy
// severity. Breach inclusion rule: BreachAt falls inside
// [now-WindowDays, now]. Inputs:
//
//   - policies: every policy row for the org (active or not).
//   - breaches: every SLA breach across both finding tables. The
//     caller normalises to lowercase severity so the matcher works.
//   - now: time reference (injected for testability).
//
// Output is sorted by severity rank (critical → low) so the UI
// renders the loudest tier first.
func ComputeUsage(policies []PolicyInput, breaches []Breach, now time.Time) []BudgetUsage {
	bySev := map[string][]Breach{}
	for _, b := range breaches {
		if b.BreachAt.IsZero() {
			continue
		}
		sev := strings.ToLower(b.Severity)
		bySev[sev] = append(bySev[sev], b)
	}

	// Canonical severity order — covers any policy the operator
	// declared even if no breaches exist (zero-usage rows still
	// surface so the operator can see "you have headroom").
	seenSev := map[string]bool{}
	var out []BudgetUsage
	for _, p := range policies {
		sev := strings.ToLower(p.Severity)
		if seenSev[sev] {
			continue
		}
		seenSev[sev] = true

		windowDays := p.WindowDays
		if windowDays <= 0 {
			windowDays = 90
		}
		alertAt := p.AlertAtPercent
		if alertAt <= 0 || alertAt > 100 {
			alertAt = 80
		}
		windowStart := now.Add(-time.Duration(windowDays) * 24 * time.Hour)

		used := 0
		for _, b := range bySev[sev] {
			if b.BreachAt.After(windowStart) && !b.BreachAt.After(now) {
				used++
			}
		}

		row := BudgetUsage{
			Severity:        sev,
			AllowedBreaches: p.AllowedBreaches,
			UsedBreaches:    used,
			WindowStart:     windowStart,
			WindowEnd:       now,
			AlertAtPercent:  alertAt,
		}
		row.RemainingBreaches = p.AllowedBreaches - used
		if row.RemainingBreaches < 0 {
			row.RemainingBreaches = 0
		}
		if p.AllowedBreaches > 0 {
			row.UsedPercent = 100.0 * float64(used) / float64(p.AllowedBreaches)
		} else if used > 0 {
			// zero-allowance + any breach = over budget by definition.
			row.UsedPercent = 100.0
		}
		row.Status = classifyStatus(p.IsActive, used, p.AllowedBreaches, alertAt)
		out = append(out, row)
	}

	// Stable severity sort — critical loudest.
	sortBySeverity(out)
	return out
}

func classifyStatus(active bool, used, allowed, alertAt int) string {
	if !active {
		return "inactive"
	}
	if allowed <= 0 {
		// Zero-tolerance policies: any breach is exhausted; no
		// breaches is healthy. There's no "warning" middle ground
		// because the only breach budget value is 0/1.
		if used == 0 {
			return "healthy"
		}
		return "exhausted"
	}
	if used >= allowed {
		return "exhausted"
	}
	pct := 100.0 * float64(used) / float64(allowed)
	if pct >= float64(alertAt) {
		return "warning"
	}
	return "healthy"
}

func sortBySeverity(rows []BudgetUsage) {
	// Manual stable sort — small N, no need to pull in sort pkg
	// for one severity-rank comparator.
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
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && rank(rows[j-1].Severity) > rank(rows[j].Severity); j-- {
			rows[j-1], rows[j] = rows[j], rows[j-1]
		}
	}
}
