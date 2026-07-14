package permission

// capabilities_promoted_test.go — assertions that every page id
// added by the 2026-05-21 IA refactor and the 2026-05-22 darkweb
// intel expansion resolves correctly per (tier × project_type ×
// role). Catches the silent-regression failure mode where a YAML
// key gets renamed and frontend canSeePage('newName') falls back
// to true forever.

import (
	"slices"
	"testing"
)

// IA refactor 2026-05-21 — items promoted out of war-room.
// Subset that's strictly ctem-gated. `brand_protection` and
// `compliance` are dual-feature (in both codeFeatures and
// ctemFeatures) so they show on Code tier too — they have their
// own coverage in TestPromoted_DualFeaturePages below.
var promotedCTEMPages = []string{
	"findings", "posture_overview", "ctem_actions",
	"mitigations", "vendor_risk", "asset_coverage",
}

var promotedDualPages = []string{
	"brand_protection", "compliance",
}

// Always-visible pages from the IA refactor — gated requires=[] +
// no feature dependency. Audit_timeline and va_report both fall
// here; the original warroom_history was always-on so we kept it.
var promotedAlwaysVisible = []string{
	"audit_timeline", "va_report", "attack_paths", "operations",
}

// posture_scoring tier — only score_trends.
var promotedScoringPages = []string{"score_trends"}

// Darkweb intel expansion 2026-05-22 — all gated on ctem.
var darkwebPages = []string{
	"threat_intel", "threat_actors", "malware_families",
	"ransomware_incidents", "ioc_lookup", "sensor_map",
}

func TestPromoted_CTEMPagesVisibleOnCTEMTier(t *testing.T) {
	c, err := Resolve(TierCTEM, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range promotedCTEMPages {
		if !slices.Contains(c.VisiblePages, p) {
			t.Errorf("CTEM tier should show %q, missing from %v", p, c.VisiblePages)
		}
	}
}

func TestPromoted_CTEMPagesHiddenOnCodeTier(t *testing.T) {
	c, err := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range promotedCTEMPages {
		if slices.Contains(c.VisiblePages, p) {
			t.Errorf("Code tier should hide %q (ctem-gated), got visible_pages=%v", p, c.VisiblePages)
		}
	}
}

func TestAssetCoverage_IsCTEMOnlyPage(t *testing.T) {
	codeOnly, err := Resolve(TierCode, PlanEnterprise, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(codeOnly.VisiblePages, "asset_coverage") {
		t.Fatal("Code-only tier must not expose asset_coverage")
	}

	ctemOnly, err := Resolve(TierCTEM, PlanStarter, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(ctemOnly.VisiblePages, "asset_coverage") {
		t.Fatal("CTEM tier must expose asset_coverage")
	}

	customWithoutCTEM, err := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil,
		ProjectTypeCustom, []string{"code_audit"})
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(customWithoutCTEM.VisiblePages, "asset_coverage") {
		t.Fatal("custom project without ctem feature must hide asset_coverage")
	}
}

func TestPromoted_AlwaysVisiblePagesAcrossTiers(t *testing.T) {
	for _, tier := range []Tier{TierCode, TierCTEM, TierCodeCTEM} {
		c, err := Resolve(tier, PlanPro, RoleAdmin, nil)
		if err != nil {
			t.Fatalf("tier=%v: %v", tier, err)
		}
		for _, p := range promotedAlwaysVisible {
			if !slices.Contains(c.VisiblePages, p) {
				t.Errorf("tier=%v should show always-visible %q, missing from %v",
					tier, p, c.VisiblePages)
			}
		}
	}
}

func TestPromoted_DualFeaturePagesVisibleOnBothTiers(t *testing.T) {
	// brand_protection / compliance live in BOTH codeFeatures and
	// ctemFeatures — surface on either tier so a Code-only customer
	// can still see brand-protection takedown signals and
	// compliance frameworks. Combined tier obviously shows them.
	for _, tier := range []Tier{TierCode, TierCTEM, TierCodeCTEM} {
		c, _ := Resolve(tier, PlanPro, RoleAdmin, nil)
		for _, p := range promotedDualPages {
			if !slices.Contains(c.VisiblePages, p) {
				t.Errorf("tier=%v should show dual-feature %q, missing", tier, p)
			}
		}
	}
}

func TestPromoted_ScorePagesGatedOnPostureScoring(t *testing.T) {
	// posture_scoring feature is in ctemFeatures; CodeCTEM tier
	// includes both Code + CTEM features so posture_scoring is on.
	c, _ := Resolve(TierCodeCTEM, PlanPro, RoleAdmin, nil)
	for _, p := range promotedScoringPages {
		if !slices.Contains(c.VisiblePages, p) {
			t.Errorf("CodeCTEM tier should show %q, missing", p)
		}
	}
	// Code-only tier doesn't have posture_scoring → hide.
	c2, _ := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	for _, p := range promotedScoringPages {
		if slices.Contains(c2.VisiblePages, p) {
			t.Errorf("Code tier should hide %q (posture_scoring required)", p)
		}
	}
}

func TestDarkweb_CTEMTierShowsAll(t *testing.T) {
	c, err := Resolve(TierCTEM, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range darkwebPages {
		if !slices.Contains(c.VisiblePages, p) {
			t.Errorf("CTEM tier should show %q, missing", p)
		}
	}
}

func TestDarkweb_CodeTierHidesAll(t *testing.T) {
	c, _ := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	for _, p := range darkwebPages {
		if slices.Contains(c.VisiblePages, p) {
			t.Errorf("Code tier should hide %q (ctem-gated)", p)
		}
	}
}

func TestWarroomAliases_StillPresent(t *testing.T) {
	// Backward-compat: the old warroom_* page ids must remain in
	// the YAML so existing customer entitlements + frontend
	// fallback URLs (warroom/:sectionId) keep working.
	c, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	aliases := []string{
		"warroom_security", "warroom_architecture", "warroom_cicd",
		"warroom_exposure", "warroom_scoring", "warroom_compliance",
		"warroom_history",
	}
	for _, a := range aliases {
		if !slices.Contains(c.VisiblePages, a) {
			t.Errorf("backward-compat alias %q missing from visible_pages on CodeCTEM tier", a)
		}
	}
}

func TestProjectType_CTEMNarrowsToCTEMPages(t *testing.T) {
	// project_type=ctem on a CodeCTEM tier should hide code pages
	// and show CTEM pages.
	c, err := ResolveWithProjectType(TierCodeCTEM, PlanPro, RoleAdmin, nil,
		ProjectTypeCTEM, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range darkwebPages {
		if !slices.Contains(c.VisiblePages, p) {
			t.Errorf("project_type=ctem should show %q", p)
		}
	}
	for _, hidden := range []string{"issues", "repos", "autofix"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("project_type=ctem should hide %q", hidden)
		}
	}
}

func TestProjectType_CodeHidesCTEMPages(t *testing.T) {
	c, err := ResolveWithProjectType(TierCodeCTEM, PlanPro, RoleAdmin, nil,
		ProjectTypeCode, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range darkwebPages {
		if slices.Contains(c.VisiblePages, p) {
			t.Errorf("project_type=code should hide darkweb %q", p)
		}
	}
}

func TestAttackPaths_AlwaysVisible(t *testing.T) {
	// attack_paths was previously NOT in YAML — frontend
	// canSeePage('attack_paths') fell through to true for all
	// customers. The 2026-05-21 audit briefly added requires:[ctem]
	// which would have hidden it from non-ctem customers, then
	// 2026-05-22 reverted to requires:[] to keep behaviour. This
	// test pins that decision: attack_paths must remain visible
	// across all tiers including TierCode.
	for _, tier := range []Tier{TierCode, TierCTEM, TierCodeCTEM} {
		c, _ := Resolve(tier, PlanPro, RoleAdmin, nil)
		if !slices.Contains(c.VisiblePages, "attack_paths") {
			t.Errorf("attack_paths must be visible on tier=%v (regression of 2026-05-22)", tier)
		}
	}
}
