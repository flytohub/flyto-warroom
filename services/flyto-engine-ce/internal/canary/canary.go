// Package canary runs periodic self-tests against domains whose
// expected scanner outputs we know in advance. If a scanner suddenly
// produces a different verdict for a canary, that scanner has
// regressed (network bug, parser bug, API change in an external
// dep) and we should not trust new findings from it until it's
// re-verified.
//
// Design:
//   - Each canary is a (domain, expected_verdicts) pair, defined in
//     YAML so non-engineers can edit
//   - Worker loop runs every `FLYTO_CANARY_INTERVAL` (default 12h)
//   - Each canary runs the actual scanners against the domain
//   - Compares results to expected; mismatches emit a
//     monitoring_event with severity=high
//   - Optionally writes a `canary_regression` flag the scoring
//     engine can consult to downgrade that scanner's confidence to
//     0 until manually cleared
package canary

import (
	"context"
	"log/slog"
	"time"
)

// CanaryCheck describes one synthetic-target expectation. The
// `Scanner` runs against `Domain` and the result is compared to
// `ExpectedVerdict`.
type CanaryCheck struct {
	Name            string `yaml:"name"`
	Domain          string `yaml:"domain"`
	ScannerKind     string `yaml:"scanner"` // e.g. "hsts", "dnssec", "ssl_cert"
	ExpectedVerdict string `yaml:"expected"`
}

// ScannerFunc is what the worker calls to run a scanner. Returns
// the verdict string ("pass" / "fail" / "inconclusive") and an
// optional detail blob for the regression report.
type ScannerFunc func(ctx context.Context, domain string) (verdict string, detail string, err error)

// Result reports the outcome of one canary check.
type Result struct {
	Check    CanaryCheck
	Observed string
	Detail   string
	OK       bool
	Error    string
}

// RegressionStore lets the scoring engine ask "is this scanner
// currently regressed?" so it can drop confidence on its findings.
// In production this is backed by the engine's main DB; tests use
// an in-memory map.
type RegressionStore interface {
	MarkRegressed(ctx context.Context, scanner string, reason string, until time.Time) error
	IsRegressed(ctx context.Context, scanner string) (bool, error)
	Clear(ctx context.Context, scanner string) error
}

// RunOnce executes every check in `checks` sequentially. Returns
// per-check Results; the caller logs/persists them.
func RunOnce(ctx context.Context, checks []CanaryCheck, runners map[string]ScannerFunc) []Result {
	out := make([]Result, 0, len(checks))
	for _, c := range checks {
		fn, ok := runners[c.ScannerKind]
		if !ok {
			out = append(out, Result{Check: c, Error: "no runner registered for scanner=" + c.ScannerKind})
			continue
		}
		ctx2, cancel := context.WithTimeout(ctx, 30*time.Second)
		v, detail, err := fn(ctx2, c.Domain)
		cancel()
		r := Result{Check: c, Observed: v, Detail: detail}
		if err != nil {
			r.Error = err.Error()
			out = append(out, r)
			continue
		}
		r.OK = (v == c.ExpectedVerdict)
		out = append(out, r)
	}
	return out
}

// HandleResults applies the regression bookkeeping: scanner sees a
// canary mismatch → record regression (24h cool-off) + emit a
// monitoring_event-style log so the worker can surface it.
//
// Returns the list of scanners flagged regressed in this run, so
// the caller can fan out alerts.
func HandleResults(ctx context.Context, results []Result, store RegressionStore, alertOnce func(scanner, reason string)) []string {
	regressed := []string{}
	for _, r := range results {
		if r.Error != "" {
			slog.Warn("canary: check errored",
				"canary", r.Check.Name, "scanner", r.Check.ScannerKind, "err", r.Error)
			continue
		}
		if r.OK {
			// Recovered? Clear any prior regression for this scanner.
			_ = store.Clear(ctx, r.Check.ScannerKind)
			continue
		}
		// Mismatch — flag the scanner and alert (once per regression).
		reason := "expected " + r.Check.ExpectedVerdict + " got " + r.Observed +
			" on canary " + r.Check.Name
		_ = store.MarkRegressed(ctx, r.Check.ScannerKind, reason, time.Now().Add(24*time.Hour))
		regressed = append(regressed, r.Check.ScannerKind)
		if alertOnce != nil {
			alertOnce(r.Check.ScannerKind, reason)
		}
		slog.Error("canary: scanner regressed",
			"scanner", r.Check.ScannerKind, "canary", r.Check.Name,
			"expected", r.Check.ExpectedVerdict, "observed", r.Observed)
	}
	return regressed
}

// RunLoop is the worker-side loop. Tick every `interval`, run the
// checks, handle the results. Pass a fresh context each tick so
// the loop can be cancelled on shutdown.
func RunLoop(ctx context.Context, interval time.Duration, checks []CanaryCheck,
	runners map[string]ScannerFunc, store RegressionStore, alertOnce func(scanner, reason string)) {
	if interval <= 0 {
		return // disabled
	}
	// Run immediately on boot — if a scanner is already broken
	// when the worker starts, we want to know now.
	results := RunOnce(ctx, checks, runners)
	HandleResults(ctx, results, store, alertOnce)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			results := RunOnce(ctx, checks, runners)
			HandleResults(ctx, results, store, alertOnce)
		}
	}
}
