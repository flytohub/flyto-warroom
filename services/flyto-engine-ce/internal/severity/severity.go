// Package severity centralises the severity-string normalisation that
// used to live as 4 independent copies across the api package
// (handlers_verify, handlers_autofix_v2_tier2, handlers_autofix_v2_derive,
// handlers_archmap, handlers_pipeline_report).
//
// Vocabulary: CRITICAL > HIGH > MEDIUM > LOW > INFO. Anything that
// doesn't map cleanly defaults to MEDIUM — refusing to guess at
// "what the scanner meant" is worse than picking a defensible middle.
package severity

import "strings"

// Level is the canonical severity bucket. Stringly-typed (not an
// enum) because every JSON layer above us already exchanges these as
// strings; converting at boundaries adds paperwork without buying
// type safety inside the package.
type Level string

const (
	Critical Level = "CRITICAL"
	High     Level = "HIGH"
	Medium   Level = "MEDIUM"
	Low      Level = "LOW"
	Info     Level = "INFO"
)

// Normalize takes whatever the scanner wrote (case-varied, with
// vendor-specific aliases like "MODERATE") and returns the canonical
// upper-case bucket. Empty / unknown input → Medium, intentionally
// defensible: a finding the scanner couldn't classify is still a
// finding worth surfacing, just not at the top.
func Normalize(s string) Level {
	u := strings.ToUpper(strings.TrimSpace(s))
	// Substring matches handle taint-category strings the indexer
	// emits like "category:critical_sql_injection" without parsing.
	switch {
	case u == "":
		return Medium
	case u == "CRITICAL" || strings.Contains(u, "CRITICAL"):
		return Critical
	case u == "HIGH" || strings.Contains(u, "HIGH"):
		return High
	case u == "LOW" || strings.Contains(u, "LOW"):
		return Low
	case u == "INFO" || u == "INFORMATIONAL" || strings.Contains(u, "INFO"):
		return Info
	case u == "MEDIUM" || u == "MODERATE" ||
		strings.Contains(u, "MEDIUM") || strings.Contains(u, "MODERATE"):
		return Medium
	}
	return Medium
}

// String returns the canonical upper-case bucket. Callers that need
// a plain Go string (e.g. for JSON marshalling without exposing the
// Level type) use this; otherwise treat Level as a string directly.
func (l Level) String() string { return string(l) }

// Rank assigns a comparable score to each level so callers can
// sort findings or pick the "worst" of a set without re-implementing
// the ordering. Higher = more severe.
func Rank(l Level) int {
	switch l {
	case Critical:
		return 4
	case High:
		return 3
	case Medium:
		return 2
	case Low:
		return 1
	case Info:
		return 0
	}
	return 2 // unknown → Medium rank
}

// AtLeast returns true when `got` is at least as severe as `min`.
// Used by gate config like `severity_min: HIGH` — a CRITICAL finding
// AtLeast(High) returns true; a LOW finding does not.
func AtLeast(got, min Level) bool {
	return Rank(got) >= Rank(min)
}
