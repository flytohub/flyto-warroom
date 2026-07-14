package permission

import (
	"slices"
	"testing"
)

func withLiveBilling(t *testing.T) {
	t.Helper()
	t.Setenv("FLYTO_BILLING_MODE", string(BillingModeLive))
}

func TestCommercial_DarkwebPagesLockedPreviewWithoutAddon(t *testing.T) {
	withLiveBilling(t)
	caps, err := Resolve(TierCTEM, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(caps.VisiblePages, "threat_intel") {
		t.Fatalf("legacy visible_pages should remain backward-compatible for CTEM darkweb pages")
	}
	if got := caps.PageStates["threat_intel"].State; got != PageStateLockedPreview {
		t.Fatalf("threat_intel state = %q, want locked_preview", got)
	}

	unlocked, err := Resolve(TierCTEM, PlanPro, RoleAdmin, []string{"darkweb_intel"})
	if err != nil {
		t.Fatal(err)
	}
	if got := unlocked.PageStates["threat_intel"].State; got != PageStateEnabled {
		t.Fatalf("threat_intel with addon state = %q, want enabled", got)
	}

	codeOnly, err := Resolve(TierCode, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := codeOnly.PageStates["threat_intel"].State; got != PageStateHidden {
		t.Fatalf("code-only threat_intel state = %q, want hidden", got)
	}
}

func TestCommercial_ReportAndRedTeamActions(t *testing.T) {
	withLiveBilling(t)
	free, err := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(free, CommercialActionReportExport); got.State != ActionStatePaymentRequired {
		t.Fatalf("free report export = %+v, want payment_required", got)
	}
	if got := CommercialActionFor(free, CommercialActionAIChat); got.State != ActionStatePaymentRequired {
		t.Fatalf("free ai chat = %+v, want payment_required", got)
	}
	if got := CommercialActionFor(free, CommercialActionAIReport); got.State != ActionStatePaymentRequired || got.BillingBehavior != BillingBehaviorCredit || got.PaywallKey != "ai_credits" {
		t.Fatalf("free ai report = %+v, want credit_required ai_credits paywall", got)
	}
	if _, ok := free.Paywalls["ai_credits"]; !ok {
		t.Fatalf("capability snapshot should include ai_credits paywall")
	}
	if got := free.Surfaces["ai"]; got.State != PageStateLockedPreview || got.BillingBehavior != BillingBehaviorCredit {
		t.Fatalf("free ai surface = %+v, want locked_preview credit_required", got)
	}
	if got := free.Surfaces["reports_compliance"]; got.State != PageStateLockedPreview || got.PaywallKey != "report_export" {
		t.Fatalf("free reports surface = %+v, want report_export locked preview", got)
	}

	pro, err := Resolve(TierCodeCTEM, PlanPro, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(pro, CommercialActionReportExport); got.State != ActionStateAllowed {
		t.Fatalf("pro report export = %+v, want allowed", got)
	}
	if got := CommercialActionFor(pro, CommercialActionRedTeamRun); got.State != ActionStatePaymentRequired {
		t.Fatalf("pro redteam run = %+v, want payment_required", got)
	}
	if got := CommercialActionFor(pro, CommercialActionAIReport); got.State != ActionStateAllowed {
		t.Fatalf("pro ai report = %+v, want allowed", got)
	}
	if got := CommercialActionFor(pro, CommercialActionAIRedTeam); got.State != ActionStatePaymentRequired {
		t.Fatalf("pro ai redteam = %+v, want payment_required", got)
	}
	if got := pro.Surfaces["reports_compliance"]; got.State != PageStateEnabled {
		t.Fatalf("pro reports surface = %+v, want enabled", got)
	}

	enterprise, err := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(enterprise, CommercialActionRedTeamRun); got.State != ActionStateAllowed {
		t.Fatalf("enterprise redteam run = %+v, want allowed", got)
	}
	if got := CommercialActionFor(enterprise, CommercialActionAIFix); got.State != ActionStateAllowed {
		t.Fatalf("enterprise ai fix = %+v, want allowed", got)
	}
	if got := CommercialActionFor(enterprise, CommercialActionAIReport); got.State != ActionStateAllowed {
		t.Fatalf("enterprise ai report = %+v, want allowed", got)
	}
	if got := CommercialActionFor(enterprise, CommercialActionDarkweb); got.State != ActionStateAllowed {
		t.Fatalf("enterprise darkweb monitor = %+v, want allowed", got)
	}
	if got := enterprise.Surfaces["darkweb"]; got.State != PageStateEnabled {
		t.Fatalf("enterprise darkweb surface = %+v, want enabled", got)
	}
	if got := enterprise.Surfaces["ai"]; got.State != PageStateEnabled {
		t.Fatalf("enterprise ai surface = %+v, want enabled", got)
	}
	if got := enterprise.Surfaces["reports_compliance"]; got.State != PageStateEnabled {
		t.Fatalf("enterprise reports surface = %+v, want enabled", got)
	}
	if got := enterprise.Surfaces["subsidiary_brand"]; got.State != PageStateEnabled {
		t.Fatalf("enterprise subsidiary/brand surface = %+v, want enabled", got)
	}

	member, err := Resolve(TierCodeCTEM, PlanEnterprise, RoleMember, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(member, CommercialActionRedTeamRun); got.State != ActionStateBlocked || got.RequiredAction != "pentest:run" {
		t.Fatalf("enterprise member redteam run = %+v, want role-blocked pentest:run", got)
	}
}

func TestCommercial_AICreditsUnlockAIReportWithoutGrantingAIFix(t *testing.T) {
	withLiveBilling(t)
	caps, err := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, []string{"ai_credits"})
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(caps, CommercialActionAIReport); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorCredit {
		t.Fatalf("ai report with credits = %+v, want allowed credit_required", got)
	}
	if got := CommercialActionFor(caps, CommercialActionAIFix); got.State != ActionStatePaymentRequired || got.RequiredFeature != "ai_fix_plan" {
		t.Fatalf("ai fix with credits = %+v, want ai_fix_plan add-on still required", got)
	}
	if got := caps.Surfaces["ai"]; got.State != PageStateEnabled || got.BillingBehavior != BillingBehaviorCredit {
		t.Fatalf("ai surface with credits = %+v, want enabled credit_required", got)
	}
}

func TestCommercial_ScanActionsUseRBACAndStayIncluded(t *testing.T) {
	withLiveBilling(t)
	member, err := Resolve(TierCodeCTEM, PlanFree, RoleMember, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(member, CommercialActionScanRun); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("member scan.run = %+v, want included allowed", got)
	}
	if got := CommercialActionFor(member, CommercialActionWarroomVerify); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("member warroom.verify = %+v, want included allowed", got)
	}
	if got := CommercialActionFor(member, "scan:trigger_external"); got.State != ActionStateBlocked || got.RequiredAction != "scan:trigger_external" {
		t.Fatalf("member external scan = %+v, want role-blocked scan:trigger_external", got)
	}

	admin, err := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(admin, "scan:trigger_external"); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("admin external scan = %+v, want included allowed", got)
	}
}

func TestCommercial_ReconcileAdditivePermissionsReopensRoleBlockedActionsOnly(t *testing.T) {
	withLiveBilling(t)
	caps, err := Resolve(TierCodeCTEM, PlanPro, RoleMember, nil)
	if err != nil {
		t.Fatal(err)
	}
	caps.Permissions = append(caps.Permissions, "scan:trigger_external", "pentest:run")

	reconciled := ReconcileCommercialActionsWithPermissions(caps)
	if got := CommercialActionFor(reconciled, "scan:trigger_external"); got.State != ActionStateAllowed || got.RequiredAction != "" {
		t.Fatalf("reconciled external scan = %+v, want allowed without required_action", got)
	}
	if got := CommercialActionFor(reconciled, CommercialActionRedTeamRun); got.State != ActionStatePaymentRequired || got.RequiredAction != "" {
		t.Fatalf("reconciled paid redteam = %+v, want payment_required unchanged", got)
	}
}

func TestCommercial_AddonsStillRequireRolePermissions(t *testing.T) {
	withLiveBilling(t)
	viewer, err := Resolve(TierCTEM, PlanEnterprise, RoleViewer, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(viewer, CommercialActionDarkweb); got.State != ActionStateBlocked || got.RequiredAction != "darkweb:monitor" {
		t.Fatalf("viewer darkweb monitor = %+v, want role-blocked darkweb:monitor", got)
	}
	if got := CommercialActionFor(viewer, CommercialActionAIFix); got.State != ActionStateBlocked || got.RequiredAction != "autofix:open_pr" {
		t.Fatalf("viewer ai fix = %+v, want role-blocked autofix:open_pr", got)
	}
	if got := CommercialActionFor(viewer, CommercialActionAIWorkflow); got.State != ActionStateBlocked || got.RequiredAction != "autofix:open_pr" {
		t.Fatalf("viewer ai workflow = %+v, want role-blocked autofix:open_pr", got)
	}

	admin, err := Resolve(TierCTEM, PlanEnterprise, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(admin, CommercialActionDarkweb); got.State != ActionStateAllowed {
		t.Fatalf("admin darkweb monitor = %+v, want allowed", got)
	}
}

func TestCommercial_TeamPlanResolves(t *testing.T) {
	withLiveBilling(t)
	caps, err := Resolve(TierCodeCTEM, PlanTeam, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(caps.Features, "report_export") {
		t.Fatalf("team plan should include report_export, features=%v", caps.Features)
	}
	if slices.Contains(caps.Features, "red_team") {
		t.Fatalf("team plan should not include red_team by default, features=%v", caps.Features)
	}
}

func TestCommercial_BillingModeEnvDefaultsToPreview(t *testing.T) {
	t.Setenv("FLYTO_BILLING_MODE", "")
	caps, err := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := caps.BillingMode; got != BillingModePreview {
		t.Fatalf("default billing mode = %q, want preview", got)
	}

	t.Setenv("FLYTO_BILLING_MODE", "live")
	live, err := Resolve(TierCodeCTEM, PlanFree, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := live.BillingMode; got != BillingModeLive {
		t.Fatalf("live env billing mode = %q, want live", got)
	}
}

func TestCommercial_PreviewUnlocksPaymentGatesButKeepsRBAC(t *testing.T) {
	admin, err := ResolveWithBillingMode(TierCodeCTEM, PlanFree, RoleAdmin, nil, BillingModePreview)
	if err != nil {
		t.Fatal(err)
	}
	if got := admin.BillingMode; got != BillingModePreview {
		t.Fatalf("billing mode = %q, want preview", got)
	}
	if got := CommercialActionFor(admin, CommercialActionReportExport); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("preview report export = %+v, want included allowed", got)
	}
	if got := CommercialActionFor(admin, CommercialActionAIReport); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("preview ai report = %+v, want included allowed", got)
	}
	if got := CommercialActionFor(admin, CommercialActionRedTeamRun); got.State != ActionStateAllowed || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("preview redteam run = %+v, want included allowed", got)
	}
	if got := admin.Surfaces["ai"]; got.State != PageStateEnabled || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("preview ai surface = %+v, want included enabled", got)
	}
	if got := admin.Surfaces["reports_compliance"]; got.State != PageStateEnabled || got.BillingBehavior != BillingBehaviorIncluded {
		t.Fatalf("preview reports surface = %+v, want included enabled", got)
	}
	if len(admin.Paywalls) != 0 {
		t.Fatalf("preview paywalls = %+v, want empty", admin.Paywalls)
	}

	member, err := ResolveWithBillingMode(TierCodeCTEM, PlanFree, RoleMember, nil, BillingModePreview)
	if err != nil {
		t.Fatal(err)
	}
	if got := CommercialActionFor(member, CommercialActionRedTeamRun); got.State != ActionStateBlocked || got.RequiredAction != "pentest:run" {
		t.Fatalf("preview member redteam run = %+v, want RBAC blocked pentest:run", got)
	}

	codeOnly, err := ResolveWithBillingMode(TierCode, PlanFree, RoleAdmin, nil, BillingModePreview)
	if err != nil {
		t.Fatal(err)
	}
	if got := codeOnly.PageStates["threat_intel"].State; got != PageStateHidden {
		t.Fatalf("preview code-only threat_intel = %q, want hidden", got)
	}
}
