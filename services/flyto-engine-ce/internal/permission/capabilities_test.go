package permission

import (
	"slices"
	"testing"
)

func TestResolve_CodeOnlyHidesCTEMPages(t *testing.T) {
	c, err := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	// CTEM-gated pages must NOT be visible on Code-only tier.
	for _, hidden := range []string{"domains", "asset_map", "warroom_exposure"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("Code tier should hide %q, got visible_pages=%v", hidden, c.VisiblePages)
		}
	}
	// Code pages must be visible.
	for _, shown := range []string{"issues", "repos", "autofix"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("Code tier should show %q, missing from %v", shown, c.VisiblePages)
		}
	}
}

func TestResolve_CTEMOnlyHidesCodePages(t *testing.T) {
	c, err := Resolve(TierCTEM, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, hidden := range []string{"issues", "repos", "autofix", "pulse"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("CTEM tier should hide %q, got %v", hidden, c.VisiblePages)
		}
	}
	for _, shown := range []string{"domains", "asset_map"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("CTEM tier should show %q, missing from %v", shown, c.VisiblePages)
		}
	}
}

func TestResolve_CombinedTierUnlocksPulse(t *testing.T) {
	// Pulse is gated on `pulse` feature which only the combined tier
	// turns on — single-pillar tiers shouldn't see Pulse because the
	// cross-dim view has nothing useful to say without both sides.
	c, _ := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	if slices.Contains(c.VisiblePages, "pulse") {
		t.Error("Code-only should not show Pulse")
	}
	c, _ = Resolve(TierCodeCTEM, PlanPro, RoleAdmin, nil)
	if !slices.Contains(c.VisiblePages, "pulse") {
		t.Error("Combined tier should show Pulse")
	}
}

func TestResolve_FreePlanDropsPremiumFeatures(t *testing.T) {
	c, _ := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, nil)
	for _, premium := range []string{"compliance", "ai_fix_plan", "executive_report", "sso"} {
		if slices.Contains(c.Features, premium) {
			t.Errorf("Free plan should not include %q", premium)
		}
	}
}

func TestResolve_EnterpriseUnlocksSSO(t *testing.T) {
	c, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleOwner, nil)
	if !slices.Contains(c.Features, "sso") {
		t.Error("Enterprise plan should include SSO")
	}
	if c.SeatCap != -1 {
		t.Errorf("Enterprise should be unlimited (seat_cap=-1), got %d", c.SeatCap)
	}
}

func TestResolve_RolePermissionsInherit(t *testing.T) {
	owner, _ := Resolve(TierCode, PlanPro, RoleOwner, nil)
	admin, _ := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	member, _ := Resolve(TierCode, PlanPro, RoleMember, nil)
	viewer, _ := Resolve(TierCode, PlanPro, RoleViewer, nil)

	// owner > admin > member > viewer > guest in permission count
	if len(owner.Permissions) <= len(admin.Permissions) {
		t.Errorf("owner perms (%d) should exceed admin (%d)", len(owner.Permissions), len(admin.Permissions))
	}
	if len(admin.Permissions) <= len(member.Permissions) {
		t.Errorf("admin perms (%d) should exceed member (%d)", len(admin.Permissions), len(member.Permissions))
	}
	if len(member.Permissions) <= len(viewer.Permissions) {
		t.Errorf("member perms (%d) should exceed viewer (%d)", len(member.Permissions), len(viewer.Permissions))
	}

	// org:delete only on owner
	for _, c := range []Capabilities{admin, member, viewer} {
		if HasAction(c, "org:delete") {
			t.Errorf("non-owner role has org:delete: %s", c.Role)
		}
	}
	if !HasAction(owner, "org:delete") {
		t.Error("owner should have org:delete")
	}

	// pentest:run admin+ only
	if HasAction(member, "pentest:run") || HasAction(viewer, "pentest:run") {
		t.Error("pentest:run should be admin+ only")
	}
	if !HasAction(admin, "pentest:run") {
		t.Error("admin should have pentest:run")
	}
}

func TestResolve_OrgFeatureOverrideEnablesExtras(t *testing.T) {
	// A customer on Code-only tier who specifically purchased CSPM
	// gets that one feature added without a tier change.
	c, _ := Resolve(TierCode, PlanEnterprise, RoleAdmin, []string{"cspm"})
	if !slices.Contains(c.Features, "cspm") {
		t.Error("cspm should be present after org override")
	}
	if !slices.Contains(c.VisiblePages, "cspm") {
		t.Error("cspm page should be visible after org override")
	}
}

func TestResolveWithProjectType_CodeKeepsOnlyCodeProduct(t *testing.T) {
	c, err := ResolveWithProjectType(TierCodeCTEMCSPM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCode, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, shown := range []string{"issues", "repos", "containers", "warroom_architecture"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("code project_type should show %q, visible_pages=%v", shown, c.VisiblePages)
		}
	}
	for _, hidden := range []string{"domains", "asset_map", "findings", "cspm", "pulse"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("code project_type should hide %q, visible_pages=%v", hidden, c.VisiblePages)
		}
	}
	if !slices.Contains(c.Features, "code_audit") || slices.Contains(c.Features, "ctem") || slices.Contains(c.Features, "cspm") || slices.Contains(c.Features, "pulse") {
		t.Errorf("code project_type feature filter drifted: %v", c.Features)
	}
}

func TestResolveWithProjectType_CTEMKeepsOnlyExternalProduct(t *testing.T) {
	c, err := ResolveWithProjectType(TierCodeCTEMCSPM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCTEM, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, shown := range []string{"domains", "asset_map", "findings", "posture_overview"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("ctem project_type should show %q, visible_pages=%v", shown, c.VisiblePages)
		}
	}
	for _, hidden := range []string{"issues", "repos", "autofix", "cspm", "pulse"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("ctem project_type should hide %q, visible_pages=%v", hidden, c.VisiblePages)
		}
	}
	if !slices.Contains(c.Features, "ctem") || slices.Contains(c.Features, "code_audit") || slices.Contains(c.Features, "cspm") || slices.Contains(c.Features, "pulse") {
		t.Errorf("ctem project_type feature filter drifted: %v", c.Features)
	}
}

func TestResolveWithProjectType_CloudKeepsOnlyCloudProduct(t *testing.T) {
	c, err := ResolveWithProjectType(TierCodeCTEMCSPM, PlanEnterprise, RoleAdmin, nil, ProjectTypeCloud, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, shown := range []string{"cspm", "containers"} {
		if !slices.Contains(c.VisiblePages, shown) {
			t.Errorf("cloud project_type should show %q, visible_pages=%v", shown, c.VisiblePages)
		}
	}
	for _, hidden := range []string{"issues", "domains", "asset_map", "findings", "pulse"} {
		if slices.Contains(c.VisiblePages, hidden) {
			t.Errorf("cloud project_type should hide %q, visible_pages=%v", hidden, c.VisiblePages)
		}
	}
	if !slices.Contains(c.Features, "cspm") || slices.Contains(c.Features, "code_audit") || slices.Contains(c.Features, "ctem") || slices.Contains(c.Features, "pulse") {
		t.Errorf("cloud project_type feature filter drifted: %v", c.Features)
	}
}

func TestResolveWithProjectType_CustomRestoresCrossDimOnlyWhenBothPillarsSelected(t *testing.T) {
	both, err := ResolveWithProjectType(
		TierCodeCTEMCSPM,
		PlanEnterprise,
		RoleAdmin,
		nil,
		ProjectTypeCustom,
		[]string{"surface_code", "code_audit", "surface_external", "ctem"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(both.VisiblePages, "pulse") {
		t.Fatalf("custom code+external project_type should restore pulse, visible_pages=%v features=%v", both.VisiblePages, both.Features)
	}

	codeOnly, err := ResolveWithProjectType(
		TierCodeCTEMCSPM,
		PlanEnterprise,
		RoleAdmin,
		nil,
		ProjectTypeCustom,
		[]string{"surface_code", "code_audit"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(codeOnly.VisiblePages, "pulse") {
		t.Fatalf("custom code-only project_type must not show pulse, visible_pages=%v features=%v", codeOnly.VisiblePages, codeOnly.Features)
	}
}

func TestResolveWithProjectType_CustomCodeShowsProductVerification(t *testing.T) {
	caps, err := ResolveWithProjectType(
		TierCodeCTEM,
		PlanEnterprise,
		RoleAdmin,
		nil,
		ProjectTypeCustom,
		[]string{"surface_code", "code_audit", "product_verification"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(caps.VisiblePages, "product_verification") {
		t.Fatalf("custom code project should show product_verification page, visible_pages=%v features=%v", caps.VisiblePages, caps.Features)
	}
	if got := caps.PageStates["product_verification"].State; got != PageStateEnabled {
		t.Fatalf("product_verification page state = %q, want %q; page=%+v", got, PageStateEnabled, caps.PageStates["product_verification"])
	}
}

func TestResolve_RejectsUnknownTier(t *testing.T) {
	if _, err := Resolve("bogus", PlanPro, RoleAdmin, nil); err == nil {
		t.Error("expected error for unknown tier")
	}
}

// TestResolve_SensitiveEvidenceAdminOnly pins the B7 access policy:
// sensitive_evidence:read (leaked/scan credentials, raw screenshots,
// takedown letters, compliance evidence) is admin+ only. Owner inherits
// admin; member / viewer / guest must NOT hold it. If this regresses,
// either every member is locked out of the B7 endpoints (grant dropped)
// or sensitive evidence leaks to non-admins (grant widened) — both are
// security-relevant, so the boundary is asserted explicitly.
func TestResolve_SensitiveEvidenceAdminOnly(t *testing.T) {
	const action = "sensitive_evidence:read"
	has := map[Role]bool{}
	for _, role := range []Role{RoleOwner, RoleAdmin, RoleMember, RoleViewer, RoleGuest} {
		c, err := Resolve(TierCodeCTEM, PlanEnterprise, role, nil)
		if err != nil {
			t.Fatalf("Resolve(%s): %v", role, err)
		}
		has[role] = HasAction(c, action)
	}
	for _, role := range []Role{RoleOwner, RoleAdmin} {
		if !has[role] {
			t.Errorf("%s must have %s", role, action)
		}
	}
	for _, role := range []Role{RoleMember, RoleViewer, RoleGuest} {
		if has[role] {
			t.Errorf("%s must NOT have %s (sensitive evidence is admin+ only)", role, action)
		}
	}
}

// TestResolve_AdminWriteActionsAdminOnly pins the B1b gates: saving the
// org provider token (org:settings) and disconnecting a repo
// (repo:disconnect) are admin+ only. These were flat org-membership
// before B1b; the migration routes them through requireAction, so a
// regression that dropped the grant from admin (lockout) or added it to
// member (privilege creep) must fail here.
func TestResolve_AdminWriteActionsAdminOnly(t *testing.T) {
	for _, action := range []string{"org:settings", "repo:disconnect"} {
		for _, role := range []Role{RoleOwner, RoleAdmin} {
			c, _ := Resolve(TierCodeCTEM, PlanEnterprise, role, nil)
			if !HasAction(c, action) {
				t.Errorf("%s must have %s", role, action)
			}
		}
		for _, role := range []Role{RoleMember, RoleViewer, RoleGuest} {
			c, _ := Resolve(TierCodeCTEM, PlanEnterprise, role, nil)
			if HasAction(c, action) {
				t.Errorf("%s must NOT have %s (admin-tier write)", role, action)
			}
		}
	}
}

// TestResolve_FootprintMutationTiers pins the layered footprint write
// gates: triggering an external footprint scan (scan:trigger_external)
// is admin+ only, while submitting footprint feedback (finding:update,
// member triage) is member+ but NOT viewer/guest. A regression here
// either locks members out of feedback or lets read-only viewers
// trigger external scans.
func TestResolve_FootprintMutationTiers(t *testing.T) {
	admin, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	member, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleMember, nil)
	viewer, _ := Resolve(TierCodeCTEM, PlanEnterprise, RoleViewer, nil)

	if !HasAction(admin, "scan:trigger_external") {
		t.Error("admin must have scan:trigger_external (footprint run/prune)")
	}
	if HasAction(member, "scan:trigger_external") {
		t.Error("member must NOT have scan:trigger_external (admin-tier)")
	}
	if !HasAction(member, "finding:update") {
		t.Error("member must have finding:update (footprint feedback triage)")
	}
	if HasAction(viewer, "finding:update") {
		t.Error("viewer must NOT have finding:update (read-only role)")
	}
}
