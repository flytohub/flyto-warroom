package permission

import (
	"slices"
	"testing"
)

func TestResolveWithProjectType_CodeFilter(t *testing.T) {
	// Customer on full tier picks `code` project_type — CTEM pages
	// must disappear even though they're entitled.
	c, err := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCode, nil)
	if err != nil {
		t.Fatal(err)
	}
	if c.ProjectType != ProjectTypeCode {
		t.Errorf("project_type = %q, want code", c.ProjectType)
	}
	for _, hidden := range []string{"domains", "asset_map", "asset_coverage", "warroom_exposure"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("code project_type leaked CTEM page %q", hidden)
		}
	}
	for _, shown := range []string{"issues", "repos", "autofix"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("code project_type lost code page %q", shown)
		}
	}
}

func TestResolveWithProjectType_CTEMFilter(t *testing.T) {
	c, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCTEM, nil)
	for _, hidden := range []string{"issues", "repos", "autofix", "pulse"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("ctem project_type leaked code page %q", hidden)
		}
	}
	for _, shown := range []string{"domains", "asset_map", "asset_coverage", "warroom_exposure"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("ctem project_type lost CTEM page %q", shown)
		}
	}
}

func TestResolveWithProjectType_All(t *testing.T) {
	a, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	b, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil, ProjectTypeAll, nil)
	if len(a.VisiblePages) != len(b.VisiblePages) {
		t.Errorf("ProjectTypeAll should match Resolve exactly: %d vs %d pages",
			len(a.VisiblePages), len(b.VisiblePages))
	}
}

func TestResolveWithProjectType_Custom(t *testing.T) {
	// Custom mode keeps ONLY the listed features. A customer who
	// picks {sast, iac} sees those code pages and nothing else.
	c, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil,
		ProjectTypeCustom, []string{"code_audit", "sast", "iac"})
	if !slices.Contains(c.VisiblePages, "issues") {
		t.Error("custom with code_audit should include issues")
	}
	if slices.Contains(c.VisiblePages, "domains") {
		t.Error("custom without ctem should hide domains")
	}
	if slices.Contains(c.VisiblePages, "autofix") {
		// autofix gated on the `autofix` feature, not in our custom list
		t.Error("custom without autofix should hide autofix page")
	}
}

func TestResolveWithProjectType_CustomEmpty(t *testing.T) {
	// Empty custom = nothing visible except `always` pages
	// (dashboard / projects / org / settings / reports / resources).
	c, _ := ResolveWithProjectType(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil,
		ProjectTypeCustom, nil)
	for _, alwaysOn := range []string{"dashboard", "projects", "org", "settings", "reports"} {
		if !slices.Contains(c.VisiblePages, alwaysOn) {
			t.Errorf("always-on page %q should survive custom-empty", alwaysOn)
		}
	}
	for _, gated := range []string{"issues", "domains", "autofix", "pulse"} {
		if slices.Contains(c.VisiblePages, gated) {
			t.Errorf("gated page %q should disappear with empty custom", gated)
		}
	}
}
