package permission

import (
	"slices"
	"strings"
	"testing"
)

func TestEditionProfilesLoadAndValidate(t *testing.T) {
	for _, name := range []string{"community", "saas", "enterprise_cloud", "self_hosted_online", "enterprise_airgap"} {
		profile, err := EditionProfileByName(name)
		if err != nil {
			t.Fatalf("EditionProfileByName(%q): %v", name, err)
		}
		if profile.DeployMode == "" {
			t.Fatalf("%s deploy_mode is empty", name)
		}
		if profile.Providers.Auth == "" || profile.Providers.Billing == "" || profile.Providers.Storage == "" || profile.Providers.AI == "" || profile.Providers.ThreatIntel == "" {
			t.Fatalf("%s providers incomplete: %+v", name, profile.Providers)
		}
		if profile.CommercialBoundary.Distribution == "" || profile.CommercialBoundary.LicenseMode == "" || profile.CommercialBoundary.EvidenceAuthority == "" || profile.CommercialBoundary.PremiumExecution == "" {
			t.Fatalf("%s commercial boundary incomplete: %+v", name, profile.CommercialBoundary)
		}
	}

	community, err := EditionProfileByName("community")
	if err != nil {
		t.Fatal(err)
	}
	if community.LicenseClass != LicenseClassApache2 {
		t.Fatalf("community license_class = %q, want apache_2", community.LicenseClass)
	}

	enterprise, err := EditionProfileByName("enterprise_airgap")
	if err != nil {
		t.Fatal(err)
	}
	if enterprise.Providers.Auth != "enterprise_jwt" || enterprise.Providers.Billing != "offline_license" || enterprise.Providers.Storage != "minio" || enterprise.Providers.AI != "local_openai_compatible" || enterprise.Providers.ThreatIntel != "offline_bundle" {
		t.Fatalf("enterprise airgap providers = %+v, want offline enterprise providers", enterprise.Providers)
	}
}

func TestEditionCommercialBoundaryDefinesBusinessModel(t *testing.T) {
	community, err := EditionProfileByName("community")
	if err != nil {
		t.Fatal(err)
	}
	if community.CommercialBoundary.LicenseMode != "none" || community.CommercialBoundary.PremiumExecution != "disabled_fail_closed" {
		t.Fatalf("community commercial boundary = %+v, want no-license fail-closed premium execution", community.CommercialBoundary)
	}

	saas, err := EditionProfileByName("saas")
	if err != nil {
		t.Fatal(err)
	}
	if saas.CommercialBoundary.LicenseMode != "subscription" || saas.CommercialBoundary.EntitlementSource != "stripe_entitlement" {
		t.Fatalf("saas commercial boundary = %+v, want Stripe subscription entitlement", saas.CommercialBoundary)
	}

	enterpriseCloud, err := EditionProfileByName("enterprise_cloud")
	if err != nil {
		t.Fatal(err)
	}
	if enterpriseCloud.CommercialBoundary.PremiumExecution != "enterprise_cloud_bridge" || enterpriseCloud.CommercialBoundary.LicenseMode != "enterprise_license" {
		t.Fatalf("enterprise cloud commercial boundary = %+v, want licensed bridge execution", enterpriseCloud.CommercialBoundary)
	}

	airgap, err := EditionProfileByName("enterprise_airgap")
	if err != nil {
		t.Fatal(err)
	}
	if airgap.CommercialBoundary.EntitlementSource != "signed_offline_license" || airgap.CommercialBoundary.EvidenceAuthority != "offline_signed_evidence" {
		t.Fatalf("airgap commercial boundary = %+v, want offline signed license/evidence", airgap.CommercialBoundary)
	}
}

func TestEnterpriseCloudProfileIsNotSaaS(t *testing.T) {
	profile, err := EditionProfileByName("enterprise_cloud")
	if err != nil {
		t.Fatal(err)
	}
	if profile.Edition != EditionEnterpriseCloud || profile.DeployMode != "enterprise_cloud" {
		t.Fatalf("enterprise cloud identity = %q/%q", profile.Edition, profile.DeployMode)
	}
	if profile.Providers.Auth != "enterprise_jwt" || profile.Providers.Billing != "offline_license" || profile.Providers.Storage != "gcs" {
		t.Fatalf("enterprise cloud providers = %+v, want enterprise auth/contract billing/managed storage", profile.Providers)
	}
	if profile.Providers.Auth == "firebase" || profile.Providers.Billing == "stripe" {
		t.Fatalf("enterprise cloud must not inherit SaaS auth/billing providers: %+v", profile.Providers)
	}
}

func TestCurrentEditionProfileInfersEnterpriseAirgap(t *testing.T) {
	t.Setenv("FLYTO_EDITION", "")
	t.Setenv("FLYTO_DEPLOY_MODE", "enterprise")
	t.Setenv("DEPLOYMENT_MODE", "")
	t.Setenv("FLYTO_AUTH_MODE", "")

	profile := CurrentEditionProfile()
	if profile.Edition != EditionEnterpriseAirgap {
		t.Fatalf("edition = %q, want enterprise_airgap", profile.Edition)
	}
}

func TestCurrentEditionProfileIgnoresAuthProviderOverride(t *testing.T) {
	t.Setenv("FLYTO_EDITION", "")
	t.Setenv("FLYTO_DEPLOY_MODE", "")
	t.Setenv("DEPLOYMENT_MODE", "")
	t.Setenv("FLYTO_AUTH_MODE", "local_jwt")

	profile, err := CurrentEditionProfileWithError()
	if err != nil {
		t.Fatalf("CurrentEditionProfileWithError: %v", err)
	}
	if profile.Edition != EditionSaaS {
		t.Fatalf("edition = %q, want saas default when only auth mode is set", profile.Edition)
	}
}

func TestCurrentEditionProfileWithErrorDefaultsToSaaSWhenUnset(t *testing.T) {
	t.Setenv("FLYTO_EDITION", "")
	t.Setenv("FLYTO_DEPLOY_MODE", "")
	t.Setenv("DEPLOYMENT_MODE", "")
	t.Setenv("FLYTO_AUTH_MODE", "")

	profile, err := CurrentEditionProfileWithError()
	if err != nil {
		t.Fatalf("CurrentEditionProfileWithError: %v", err)
	}
	if profile.Edition != EditionSaaS {
		t.Fatalf("edition = %q, want saas", profile.Edition)
	}
}

func TestCurrentEditionProfileWithErrorRejectsUnknownExplicitEdition(t *testing.T) {
	t.Setenv("FLYTO_EDITION", "enterprise-airgapp")
	t.Setenv("FLYTO_DEPLOY_MODE", "")
	t.Setenv("DEPLOYMENT_MODE", "")
	t.Setenv("FLYTO_AUTH_MODE", "")

	_, err := CurrentEditionProfileWithError()
	if err == nil || !strings.Contains(err.Error(), "unknown edition") {
		t.Fatalf("CurrentEditionProfileWithError error = %v, want unknown edition", err)
	}
}

func TestApplyEditionProfileEnterpriseAirgap(t *testing.T) {
	base, err := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	profile, err := EditionProfileByName("enterprise_airgap")
	if err != nil {
		t.Fatal(err)
	}

	caps := ApplyEditionProfile(base, profile)
	if caps.Edition != "enterprise_airgap" || caps.DeployMode != "enterprise_airgap" || caps.LicenseClass != "commercial" {
		t.Fatalf("edition fields = edition:%q deploy:%q license:%q", caps.Edition, caps.DeployMode, caps.LicenseClass)
	}
	if caps.Providers.Billing != "offline_license" || caps.Providers.Storage != "minio" || caps.Providers.AI != "local_openai_compatible" {
		t.Fatalf("providers = %+v, want offline enterprise providers", caps.Providers)
	}
	if caps.CommercialBoundary.LicenseMode != "offline_license" || caps.CommercialBoundary.PremiumExecution != "private_runner_bundle" {
		t.Fatalf("commercial boundary = %+v, want offline license/private runner bundle", caps.CommercialBoundary)
	}
	if got := caps.Surfaces["marketplace"]; got.State != PageStateHidden || got.BillingBehavior != BillingBehaviorBlocked {
		t.Fatalf("marketplace surface = %+v, want hidden blocked", got)
	}
	if got := CommercialActionFor(caps, "billing.checkout"); got.State != ActionStateBlocked || got.BillingBehavior != BillingBehaviorBlocked {
		t.Fatalf("billing checkout = %+v, want blocked", got)
	}
	if len(caps.VisiblePages) == 0 {
		t.Fatalf("edition profile should not erase legacy visible_pages")
	}
}

func TestApplyEditionProfileCommunityBlocksEnterpriseActions(t *testing.T) {
	base, err := Resolve(TierCodeCTEM, PlanEnterprise, RoleAdmin, nil)
	if err != nil {
		t.Fatal(err)
	}
	profile, err := EditionProfileByName("community")
	if err != nil {
		t.Fatal(err)
	}

	caps := ApplyEditionProfile(base, profile)
	if caps.Edition != "community" || caps.LicenseClass != "apache_2" {
		t.Fatalf("community fields = edition:%q license:%q", caps.Edition, caps.LicenseClass)
	}
	if !slices.Contains(caps.HiddenSurfaces, "ai_governance") || !slices.Contains(caps.HiddenSurfaces, "sso") {
		t.Fatalf("community hidden_surfaces = %v, want enterprise-only surfaces hidden", caps.HiddenSurfaces)
	}
	if got := CommercialActionFor(caps, CommercialActionRedTeamRun); got.State != ActionStateBlocked {
		t.Fatalf("community redteam.run = %+v, want blocked", got)
	}
	if got := CommercialActionFor(caps, CommercialActionDarkweb); got.State != ActionStateBlocked {
		t.Fatalf("community darkweb.monitor = %+v, want blocked", got)
	}
	if got := CommercialActionFor(caps, CommercialActionAIWorkflow); got.State != ActionStateBlocked {
		t.Fatalf("community ai.workflow_mcp.call = %+v, want blocked", got)
	}
}
