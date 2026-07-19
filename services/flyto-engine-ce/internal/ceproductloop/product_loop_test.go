package ceproductloop

import (
	"testing"
	"time"
)

func TestBuildReturnsProviderFreeClosedLoopContract(t *testing.T) {
	now := time.Date(2026, 7, 19, 8, 30, 0, 0, time.UTC)
	got := Build(now)

	if got.Schema != Schema || got.Product != ProductName || got.Edition != "community" {
		t.Fatalf("unexpected contract identity: %#v", got)
	}
	if got.DataMode != "deterministic_demo_seed" || got.ProviderExecution != "none" {
		t.Fatalf("CE product-loop must not claim live provider execution: %#v", got)
	}
	if got.GeneratedAt != now.Format(time.RFC3339) {
		t.Fatalf("generated_at = %q", got.GeneratedAt)
	}

	surfaces := map[string]bool{}
	for _, asset := range got.Assets {
		surfaces[asset.Surface] = true
	}
	for _, surface := range []string{"code", "container", "cloud", "runtime", "external"} {
		if !surfaces[surface] {
			t.Fatalf("missing surface %q in assets %#v", surface, got.Assets)
		}
	}
	if got.Summary.AssetCount != len(got.Assets) ||
		got.Summary.FindingCount != len(got.Findings) ||
		got.Summary.EvidenceCount != len(got.Evidence) ||
		got.Summary.RemediationCount != len(got.Remediation) ||
		got.Summary.ValidationCount != len(got.Validation) {
		t.Fatalf("summary count mismatch: %#v", got.Summary)
	}
	if got.Summary.AttackPathCount != len(got.AttackPaths) || got.Summary.AttackPathCount == 0 {
		t.Fatalf("attack-path summary mismatch: %#v", got.Summary)
	}
	if len(got.Summary.ImpactedAssets) == 0 {
		t.Fatalf("expected impacted assets from resource graph")
	}
	if got.SLA.TotalOpen == 0 || got.SLA.GeneratedAt.IsZero() {
		t.Fatalf("expected populated SLA report: %#v", got.SLA)
	}

	if got.MergeContract.Authoritative != "engine_capability_and_evidence_contract" {
		t.Fatalf("merge authority drifted: %#v", got.MergeContract)
	}
	seenLiveRemediationGate := false
	for _, overlay := range got.EnterpriseOverlay {
		if overlay.Capability == "live_cloud_remediation" && overlay.CEBehavior == "manual_control_plan" {
			seenLiveRemediationGate = true
		}
	}
	if !seenLiveRemediationGate {
		t.Fatalf("missing live remediation Enterprise gate: %#v", got.EnterpriseOverlay)
	}
}
