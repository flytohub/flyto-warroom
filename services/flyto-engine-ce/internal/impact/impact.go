package impact

// Package impact — monetary impact estimator for security findings.
//
// CFOs ask "what does this cost the business if exploited?"
// Bitsight gives you a score. Snyk gives you a CVSS. Neither
// translates to $. Real enterprise CTEM (Kovrr / Axio / SAFE)
// turns findings into dollar estimates by combining:
//
//   1. Industry breach-cost benchmarks (IBM Cost of a Data
//      Breach Report 2024 — sector-segmented mean per record /
//      per incident).
//   2. Asset criticality multiplier (crown_jewel × 1.5, etc.
//      matches the existing priority engine ladder).
//   3. CVSS / severity tier (critical 1.0×, high 0.6×, medium
//      0.25×, low 0.05×).
//   4. Exploitability factor (KEV + EPSS + reachability when
//      available).
//   5. Confidence band: produce LOW / MID / HIGH not a single
//      point estimate — operators are right to be skeptical of
//      false precision.
//
// Honesty posture: the output is a RANGE with the methodology
// disclosed in the response. We do NOT claim "this finding
// costs $1,247,892" — that's the kind of fake-precision CTEM
// vendors lose trust on. We output `low / mid / high` plus the
// inputs that produced the band, so an operator can defend the
// number to their CFO.

import (
	"fmt"
	"strings"
)

// Estimate is one finding's monetary impact projection. All
// values in USD. Range is conservative: the spread between
// low and high reflects the uncertainty in the inputs.
//
// Honesty wording (per advisor 2026-05-18): we explicitly call
// this "Potential financial exposure / Estimated business impact
// range" — NOT a deterministic dollar value. The Label field
// holds the customer-facing phrasing so the UI doesn't have to
// invent it. CISO can defend the number to the CFO precisely
// because we don't claim "$1,247,892 — trust me".
type Estimate struct {
	LowUSD       int      `json:"low_usd"`
	MidUSD       int      `json:"mid_usd"`
	HighUSD      int      `json:"high_usd"`
	Confidence   string   `json:"confidence"` // low | medium | high
	Label        string   `json:"label"`      // "Potential financial exposure"
	Methodology  string   `json:"methodology"`
	InputSummary []string `json:"input_summary"`
	// BenchmarkSource discloses which year + report produced
	// the sector numbers. Lets the UI surface "based on IBM 2024
	// Cost of Data Breach" footer + makes the methodology trail
	// auditable.
	BenchmarkSource string `json:"benchmark_source"`
}

// Input is the bundle of facts the estimator consumes. Most
// callers will build this from a CTEMPriorityItem.
type Input struct {
	Sector            string   // industry sector key (finance / saas / retail / ...)
	Severity          string   // critical | high | medium | low
	AssetTier         string   // crown_jewel | customer_facing | internal | sandbox
	ComplianceScope   []string // e.g. ["pii", "pci"] — boosts breach cost
	KEVListed         bool
	EPSSScore         float64 // 0..1
	ReachabilityKnown bool    // when true, ExploitabilityFactor is reliable
	RecordsAtRisk     int     // optional; when supplied we use per-record costing instead of per-incident
}

// Compute returns a monetary estimate for the input. Errors are
// deliberately absent — when inputs are degenerate (empty
// sector, unknown severity) we degrade to a conservative
// fallback range based on industry-average breach cost.
//
// Uses the process-active benchmark catalog (set via
// SetActiveCatalog) so benchmark data stays current with the
// annual IBM report without redeploys.
func Compute(in Input) Estimate {
	return ComputeWith(in, getActiveCatalog())
}

// ComputeWith is the explicit-catalog form. Tests and callers
// that want to pin a specific benchmark year use this.
func ComputeWith(in Input, cat *Catalog) Estimate {
	if cat == nil {
		cat = getActiveCatalog()
	}
	sector := strings.ToLower(strings.TrimSpace(in.Sector))
	if sector == "" {
		sector = "unknown"
	}

	// 1. Base cost from sector benchmark (loadable from
	// config/breach_benchmarks.yaml). The catalog returns
	// global-average fallback when sector is unknown.
	base, perRecord, sectorLabel, sourceLabel := cat.Resolve(sector)
	_ = sectorLabel

	// 2. Severity multiplier.
	sevMul, sevLabel := severityMultiplier(in.Severity)

	// 3. Asset tier multiplier.
	tierMul, tierLabel := tierMultiplier(in.AssetTier)

	// 4. Compliance scope premium — PCI/HIPAA findings cost
	// materially more (regulatory fines + reporting costs).
	complianceBoost, complianceLabels := compliancePremium(in.ComplianceScope)

	// 5. Exploitability factor (KEV / EPSS).
	exploitMul, exploitSignals := exploitabilityFactor(in)

	// Pick costing model: per-record when records_at_risk > 0
	// (more accurate for data-exposure findings), else per-
	// incident (CVE / config issue / etc).
	var mid float64
	var costingModel string
	if in.RecordsAtRisk > 0 {
		mid = perRecord * float64(in.RecordsAtRisk)
		costingModel = "per_record"
	} else {
		mid = base
		costingModel = "per_incident"
	}
	mid = mid * sevMul * tierMul * complianceBoost * exploitMul

	// Confidence band: ±35% mid-confidence, ±20% high-confidence,
	// ±60% low-confidence. Driven by whether we have reachability
	// data + KEV/EPSS attribution.
	confidence, spread := confidenceFromInputs(in)
	low := int(mid * (1 - spread))
	high := int(mid * (1 + spread))
	if low < 0 {
		low = 0
	}

	summary := []string{
		fmt.Sprintf("sector=%s", sector),
		fmt.Sprintf("severity=%s×%.2f", sevLabel, sevMul),
		fmt.Sprintf("tier=%s×%.2f", tierLabel, tierMul),
		fmt.Sprintf("costing=%s", costingModel),
	}
	if len(complianceLabels) > 0 {
		summary = append(summary, fmt.Sprintf("compliance=%s×%.2f",
			strings.Join(complianceLabels, "+"), complianceBoost))
	}
	if len(exploitSignals) > 0 {
		summary = append(summary, fmt.Sprintf("exploit=%s×%.2f",
			strings.Join(exploitSignals, "+"), exploitMul))
	}

	return Estimate{
		LowUSD:          low,
		MidUSD:          int(mid),
		HighUSD:         high,
		Confidence:      confidence,
		Label:           "Potential financial exposure",
		Methodology:     "Estimated business impact range: " + sourceLabel + " sector benchmark × severity × asset tier × compliance × exploitability",
		InputSummary:    summary,
		BenchmarkSource: sourceLabel,
	}
}

func severityMultiplier(sev string) (float64, string) {
	switch strings.ToLower(sev) {
	case "critical":
		return 1.0, "critical"
	case "high":
		return 0.6, "high"
	case "medium", "moderate":
		return 0.25, "medium"
	case "low":
		return 0.05, "low"
	}
	return 0.10, "unknown"
}

func tierMultiplier(tier string) (float64, string) {
	switch strings.ToLower(tier) {
	case "crown_jewel":
		return 1.5, "crown_jewel"
	case "customer_facing":
		return 1.2, "customer_facing"
	case "sandbox":
		return 0.5, "sandbox"
	}
	return 1.0, "internal"
}

func compliancePremium(scopes []string) (float64, []string) {
	if len(scopes) == 0 {
		return 1.0, nil
	}
	boost := 1.0
	var labels []string
	for _, s := range scopes {
		switch strings.ToLower(s) {
		case "pci":
			boost *= 1.35 // PCI fines + reissuance
			labels = append(labels, "pci")
		case "hipaa":
			boost *= 1.40 // OCR penalties + per-record uplift
			labels = append(labels, "hipaa")
		case "pii":
			boost *= 1.20 // GDPR/CCPA exposure
			labels = append(labels, "pii")
		case "sox":
			boost *= 1.15
			labels = append(labels, "sox")
		case "gdpr":
			boost *= 1.30
			labels = append(labels, "gdpr")
		}
	}
	// Cap at 2× — stacking 4 scopes shouldn't quadruple cost.
	if boost > 2.0 {
		boost = 2.0
	}
	return boost, labels
}

func exploitabilityFactor(in Input) (float64, []string) {
	mul := 1.0
	var signals []string
	if in.KEVListed {
		// KEV = known to be exploited in the wild. Doubles
		// the likely exploitation probability vs theoretical.
		mul *= 1.5
		signals = append(signals, "KEV")
	}
	if in.EPSSScore >= 0.5 {
		mul *= 1.3
		signals = append(signals, fmt.Sprintf("EPSS%.0f", in.EPSSScore*100))
	} else if in.EPSSScore >= 0.1 {
		mul *= 1.1
		signals = append(signals, fmt.Sprintf("EPSS%.0f", in.EPSSScore*100))
	}
	if in.ReachabilityKnown {
		// We have proof the vulnerable code is reachable;
		// not a discount, but a confidence boost (caller uses
		// it for the band width).
		signals = append(signals, "reachable")
	}
	// Cap exploitability multiplier so a single finding can't
	// 10× the base cost.
	if mul > 2.5 {
		mul = 2.5
	}
	return mul, signals
}

// confidenceFromInputs returns (label, half-band). Wider band
// when we don't know reachability or exploitability — operators
// shouldn't trust precision we can't deliver.
func confidenceFromInputs(in Input) (string, float64) {
	score := 0
	if in.ReachabilityKnown {
		score++
	}
	if in.KEVListed || in.EPSSScore > 0 {
		score++
	}
	if in.RecordsAtRisk > 0 {
		score++
	}
	switch score {
	case 0:
		return "low", 0.60
	case 1:
		return "medium", 0.40
	case 2:
		return "medium", 0.30
	default:
		return "high", 0.20
	}
}
