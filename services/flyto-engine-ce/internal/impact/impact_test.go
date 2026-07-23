package impact

import "testing"

func TestCompute_BaseFinanceCritical(t *testing.T) {
	in := Input{
		Sector:    "finance",
		Severity:  "critical",
		AssetTier: "internal",
	}
	est := Compute(in)
	// finance base $6.08M × severity 1.0 × tier 1.0 = $6.08M mid
	if est.MidUSD < 4_000_000 || est.MidUSD > 9_000_000 {
		t.Errorf("finance critical mid should be near $6M, got $%d", est.MidUSD)
	}
	if est.LowUSD >= est.MidUSD || est.HighUSD <= est.MidUSD {
		t.Errorf("low<mid<high invariant broken: %d/%d/%d",
			est.LowUSD, est.MidUSD, est.HighUSD)
	}
}

func TestCompute_CrownJewelLifts(t *testing.T) {
	baseline := Compute(Input{Sector: "saas", Severity: "high", AssetTier: "internal"})
	jewel := Compute(Input{Sector: "saas", Severity: "high", AssetTier: "crown_jewel"})
	if jewel.MidUSD <= baseline.MidUSD {
		t.Errorf("crown_jewel should cost more: jewel=$%d vs internal=$%d",
			jewel.MidUSD, baseline.MidUSD)
	}
}

func TestCompute_KEVLifts(t *testing.T) {
	noKEV := Compute(Input{Sector: "finance", Severity: "high", AssetTier: "internal"})
	withKEV := Compute(Input{Sector: "finance", Severity: "high", AssetTier: "internal", KEVListed: true})
	if withKEV.MidUSD <= noKEV.MidUSD {
		t.Errorf("KEV should lift cost: with=%d, without=%d", withKEV.MidUSD, noKEV.MidUSD)
	}
}

func TestCompute_PerRecordCosting(t *testing.T) {
	perRec := Compute(Input{
		Sector:        "healthcare",
		Severity:      "critical",
		AssetTier:     "customer_facing",
		RecordsAtRisk: 100_000,
	})
	// healthcare per-record ~$408 × 100k × 1.0 (critical) × 1.2 (cust_facing)
	// = ~$49M
	if perRec.MidUSD < 30_000_000 || perRec.MidUSD > 70_000_000 {
		t.Errorf("100k healthcare records should be ~$49M, got $%d", perRec.MidUSD)
	}
}

func TestCompute_ConfidenceBand(t *testing.T) {
	low := Compute(Input{Sector: "finance", Severity: "high"})
	if low.Confidence != "low" {
		t.Errorf("no exploit/reach signals should be low confidence, got %s", low.Confidence)
	}

	highConf := Compute(Input{
		Sector: "finance", Severity: "high", KEVListed: true,
		ReachabilityKnown: true, RecordsAtRisk: 10000,
	})
	if highConf.Confidence != "high" {
		t.Errorf("KEV + reach + records should be high confidence, got %s", highConf.Confidence)
	}
}

func TestCompute_ComplianceBoost(t *testing.T) {
	plain := Compute(Input{Sector: "retail", Severity: "critical"})
	pii := Compute(Input{Sector: "retail", Severity: "critical", ComplianceScope: []string{"pci", "pii"}})
	if pii.MidUSD <= plain.MidUSD {
		t.Errorf("PCI+PII compliance scope should lift cost: with=%d plain=%d",
			pii.MidUSD, plain.MidUSD)
	}
}

func TestCompute_ComplianceCappedAt2x(t *testing.T) {
	stacked := Compute(Input{
		Sector: "finance", Severity: "critical",
		ComplianceScope: []string{"pci", "hipaa", "pii", "gdpr", "sox"},
	})
	plain := Compute(Input{Sector: "finance", Severity: "critical"})
	ratio := float64(stacked.MidUSD) / float64(plain.MidUSD)
	if ratio > 2.05 {
		t.Errorf("compliance stack should cap at 2×, got %.2f", ratio)
	}
}

func TestCompute_SeverityLowSmallCost(t *testing.T) {
	low := Compute(Input{Sector: "retail", Severity: "low", AssetTier: "sandbox"})
	if low.MidUSD > 300_000 {
		t.Errorf("low+sandbox should be small, got $%d", low.MidUSD)
	}
}

func TestCompute_UnknownSectorFallsBack(t *testing.T) {
	est := Compute(Input{Sector: "", Severity: "high"})
	// Should use industry-average benchmark.
	if est.MidUSD == 0 {
		t.Error("unknown sector should still produce non-zero estimate")
	}
}

func TestCompute_LowMidHighOrdered(t *testing.T) {
	in := Input{Sector: "saas", Severity: "high", AssetTier: "customer_facing"}
	e := Compute(in)
	if !(e.LowUSD < e.MidUSD && e.MidUSD < e.HighUSD) {
		t.Errorf("low<mid<high broken: %d/%d/%d", e.LowUSD, e.MidUSD, e.HighUSD)
	}
}
