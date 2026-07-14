package permission

// capabilities_surfaces_test.go — page-registry coverage for the
// security surfaces that were previously dead ends in the UI (the
// wizard let a customer pick the surface but canSeePage(...) was
// always false because the page id was never in the YAML).
//
//	vuln_mgmt — unified CVE view, every paying tier, both project types.
//	identity  — BYO IdP posture; gated on the `identity` feature which
//	            is NOT in any default tier (org enables it when an IdP
//	            is wired), so it is hidden until connected — never a
//	            dead "soon" tile.
//	mcp       — MCP Guardian read surface; gated on the `mcp` feature
//	            (enterprise plan), survives both project types.

import (
	"slices"
	"testing"
)

func TestSurface_VulnMgmtVisibleOnEveryPayingTier(t *testing.T) {
	for _, tier := range []Tier{TierCode, TierCTEM, TierCodeCTEM, TierCodeCTEMCSPM} {
		c, err := Resolve(tier, PlanPro, RoleAdmin, nil)
		if err != nil {
			t.Fatalf("tier=%v: %v", tier, err)
		}
		if !slices.Contains(c.VisiblePages, "vuln_mgmt") {
			t.Errorf("tier=%v should show vuln_mgmt, missing from %v", tier, c.VisiblePages)
		}
	}
}

func TestSurface_VulnMgmtSurvivesBothProjectTypes(t *testing.T) {
	// vuln_mgmt is in BOTH codeFeatures and ctemFeatures, so a customer
	// who narrows project_type to code (SCA/container CVEs) or to ctem
	// (external CVEs) still gets the vulnerability view.
	for _, pt := range []ProjectType{ProjectTypeCode, ProjectTypeCTEM, ProjectTypeAll} {
		c, err := ResolveWithProjectType(TierCodeCTEM, PlanPro, RoleAdmin, nil, pt, nil)
		if err != nil {
			t.Fatalf("pt=%v: %v", pt, err)
		}
		if !slices.Contains(c.VisiblePages, "vuln_mgmt") {
			t.Errorf("project_type=%v should keep vuln_mgmt, got %v", pt, c.VisiblePages)
		}
	}
}

func TestSurface_IdentityHiddenUntilProviderWired(t *testing.T) {
	// identity is BYO: not in any default tier, so it stays hidden — never a
	// dead "soon" tile — until the org's features include `identity` (added
	// when an IdP integration is wired).
	for _, tier := range []Tier{TierCode, TierCTEM, TierCodeCTEM, TierCodeCTEMCSPM} {
		c, _ := Resolve(tier, PlanEnterprise, RoleAdmin, nil)
		if slices.Contains(c.VisiblePages, "identity") {
			t.Errorf("tier=%v should HIDE identity until an IdP is wired, got visible", tier)
		}
	}
	// Once the org-features override adds `identity`, the page resolves.
	c, _ := Resolve(TierCTEM, PlanPro, RoleAdmin, []string{"identity"})
	if !slices.Contains(c.VisiblePages, "identity") {
		t.Errorf("identity should be visible once the `identity` feature is enabled, got %v", c.VisiblePages)
	}
}

func TestSurface_IdentitySurvivesBothProjectTypesWhenEnabled(t *testing.T) {
	for _, pt := range []ProjectType{ProjectTypeCode, ProjectTypeCTEM, ProjectTypeAll} {
		c, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, []string{"identity"}, pt, nil)
		if !slices.Contains(c.VisiblePages, "identity") {
			t.Errorf("project_type=%v should keep identity once enabled, got %v", pt, c.VisiblePages)
		}
	}
}

func TestSurface_MCPGatedOnEnterprise(t *testing.T) {
	// mcp is an enterprise plan_features entry → visible on enterprise, hidden
	// on pro/free, regardless of tier.
	c, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	if !slices.Contains(c.VisiblePages, "mcp") {
		t.Errorf("enterprise plan should show mcp, missing from %v", c.VisiblePages)
	}
	c2, _ := Resolve(TierCodeCTEM, PlanPro, RoleAdmin, nil)
	if slices.Contains(c2.VisiblePages, "mcp") {
		t.Errorf("pro plan should hide mcp (enterprise-gated), got visible")
	}
}

func TestSurface_MCPSurvivesBothProjectTypes(t *testing.T) {
	for _, pt := range []ProjectType{ProjectTypeCode, ProjectTypeCTEM, ProjectTypeAll} {
		c, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, pt, nil)
		if !slices.Contains(c.VisiblePages, "mcp") {
			t.Errorf("project_type=%v should keep mcp on enterprise, got %v", pt, c.VisiblePages)
		}
	}
}

func TestSurface_CloudProjectTypeResolvesCloudFeatures(t *testing.T) {
	// project_type=cloud is the Cloud CSPM pillar view. Resolve against
	// TierCodeCTEMCSPM specifically — it's the only tier that grants
	// cspm/surface_cloud, and applyProjectType intersects with the
	// tier-resolved feature set, so a lesser tier would yield no cloud
	// features (correct per the intersection model, but not what this
	// test is asserting).
	c, err := ResolveWithProjectType(TierCodeCTEMCSPM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCloud, nil)
	if err != nil {
		t.Fatalf("resolve cloud project_type: %v", err)
	}
	if c.ProjectType != ProjectTypeCloud {
		t.Errorf("ProjectType = %v, want %v", c.ProjectType, ProjectTypeCloud)
	}

	// Cloud surface features survive.
	for _, f := range []string{"cspm", "surface_cloud"} {
		if !slices.Contains(c.Features, f) {
			t.Errorf("cloud project_type should keep %q, got features %v", f, c.Features)
		}
	}
	// Code-only features are filtered out.
	for _, f := range []string{"sast", "autofix"} {
		if slices.Contains(c.Features, f) {
			t.Errorf("cloud project_type should drop code-only %q, got features %v", f, c.Features)
		}
	}

	// Page visibility follows the filtered feature set: the cspm page
	// (requires:[cspm]) resolves; code/ctem pages do not.
	if !slices.Contains(c.VisiblePages, "cspm") {
		t.Errorf("cloud project_type should show cspm page, got %v", c.VisiblePages)
	}
	if slices.Contains(c.VisiblePages, "issues") {
		t.Errorf("cloud project_type should hide code-only issues page, got %v", c.VisiblePages)
	}
	if slices.Contains(c.VisiblePages, "domains") {
		t.Errorf("cloud project_type should hide ctem-only domains page, got %v", c.VisiblePages)
	}
}

// TestSurface_CustomCombinedRestoresPulse pins the regression where a custom
// org that enables BOTH pillars still lost Pulse. Pulse is a derived cross-dim
// surface, never a pickable module, so it is absent from custom_features even
// when every pillar is selected; applyProjectType now restores it (and
// cross_dim_correlation) when the custom set spans code + external.
func TestSurface_CustomCombinedRestoresPulse(t *testing.T) {
	// Both sides present → Pulse restored.
	combined := []string{"surface_code", "code_audit", "surface_external", "ctem", "attack_surface"}
	c, err := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCustom, combined)
	if err != nil {
		t.Fatalf("resolve custom combined: %v", err)
	}
	if !slices.Contains(c.Features, "pulse") {
		t.Errorf("custom org spanning code+external should grant pulse; features=%v", c.Features)
	}
	if !slices.Contains(c.VisiblePages, "pulse") {
		t.Errorf("pulse page should be visible for a combined custom org; pages=%v", c.VisiblePages)
	}

	// Code-only custom must NOT get pulse (cross-dim needs both sides).
	codeOnly := []string{"surface_code", "code_audit", "sast"}
	c2, err := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCustom, codeOnly)
	if err != nil {
		t.Fatalf("resolve custom code-only: %v", err)
	}
	if slices.Contains(c2.Features, "pulse") {
		t.Errorf("code-only custom must not get pulse; features=%v", c2.Features)
	}
	if slices.Contains(c2.VisiblePages, "pulse") {
		t.Errorf("code-only custom must not show pulse page; pages=%v", c2.VisiblePages)
	}
}
