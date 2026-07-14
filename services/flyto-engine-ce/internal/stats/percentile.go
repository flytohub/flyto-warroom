package stats

// Package stats — tiny stats helpers shared across the engine.
// First inhabitant: nearest-rank percentile, used by the peer
// baseline worker, the MTTR rollup worker, and the backfill CLI.
// Centralised so they stay in lockstep — a refactor of the
// algorithm only needs one edit.

import "math"

// Percentile computes the nearest-rank percentile of an already-
// sorted ascending slice. p is the percentile in [0, 100] —
// values outside that range clamp to the endpoints.
//
// Why nearest-rank instead of linear interpolation:
//
//   - The output stays in the same unit as the input (no
//     fractional values inserted between observations).
//   - It matches what most operators mean when they say "P50":
//     "find the value at the middle position of the sorted set".
//   - Reading consistency across the codebase — the SLA monitor,
//     score trends, and backfill output all need to agree on
//     what "P90 = 720" means.
//
// Empty input returns 0. Single-element input returns that
// element regardless of p.
func Percentile(sorted []float64, p int) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if p <= 0 {
		return sorted[0]
	}
	if p >= 100 {
		return sorted[len(sorted)-1]
	}
	// Nearest-rank formula: idx = ceil(p/100 × n) - 1, clamped
	// to a valid slice index.
	idx := int(math.Ceil(float64(p)/100.0*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

// Average returns the arithmetic mean of xs. Empty input returns 0.
// Surfaces alongside Percentile because the MTTR rollup uses both.
func Average(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	var s float64
	for _, x := range xs {
		s += x
	}
	return s / float64(len(xs))
}
