package permission

import (
	_ "embed"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

//go:embed editions.yaml
var editionsYAML []byte

type Edition string

const (
	EditionCommunity        Edition = "community"
	EditionSaaS             Edition = "saas"
	EditionEnterpriseCloud  Edition = "enterprise_cloud"
	EditionSelfHostedOnline Edition = "self_hosted_online"
	EditionEnterpriseAirgap Edition = "enterprise_airgap"
)

type LicenseClass string

const (
	LicenseClassApache2    LicenseClass = "apache_2"
	LicenseClassCommercial LicenseClass = "commercial"
)

type EditionProviders struct {
	Auth        string `json:"auth,omitempty" yaml:"auth"`
	Billing     string `json:"billing,omitempty" yaml:"billing"`
	Storage     string `json:"storage,omitempty" yaml:"storage"`
	AI          string `json:"ai,omitempty" yaml:"ai"`
	ThreatIntel string `json:"threat_intel,omitempty" yaml:"threat_intel"`
}

type EditionCommercialBoundary struct {
	Distribution      string `json:"distribution,omitempty" yaml:"distribution"`
	LicenseMode       string `json:"license_mode,omitempty" yaml:"license_mode"`
	EntitlementSource string `json:"entitlement_source,omitempty" yaml:"entitlement_source"`
	EvidenceAuthority string `json:"evidence_authority,omitempty" yaml:"evidence_authority"`
	PremiumExecution  string `json:"premium_execution,omitempty" yaml:"premium_execution"`
	UpgradePath       string `json:"upgrade_path,omitempty" yaml:"upgrade_path"`
	ReleaseGate       string `json:"release_gate,omitempty" yaml:"release_gate"`
}

type EditionProfile struct {
	Edition            Edition                   `json:"edition" yaml:"-"`
	DeployMode         string                    `json:"deploy_mode" yaml:"deploy_mode"`
	LicenseClass       LicenseClass              `json:"license_class" yaml:"license_class"`
	Providers          EditionProviders          `json:"providers" yaml:"providers"`
	CommercialBoundary EditionCommercialBoundary `json:"commercial_boundary" yaml:"commercial_boundary"`
	HiddenSurfaces     []string                  `json:"hidden_surfaces" yaml:"hidden_surfaces"`
	UnsupportedActions []string                  `json:"unsupported_actions" yaml:"unsupported_actions"`
}

type editionManifest struct {
	Editions map[string]EditionProfile `yaml:"editions"`
}

var (
	editionOnce sync.Once
	editionData editionManifest
	editionErr  error
)

func loadEditions() error {
	editionOnce.Do(func() {
		if err := yaml.Unmarshal(editionsYAML, &editionData); err != nil {
			editionErr = fmt.Errorf("editions yaml: %w", err)
			return
		}
		if len(editionData.Editions) == 0 {
			editionErr = fmt.Errorf("editions yaml: no editions declared")
			return
		}
		normalized := make(map[string]EditionProfile, len(editionData.Editions))
		for key, profile := range editionData.Editions {
			profile.Edition = Edition(normalizeEditionName(key))
			if err := validateEditionProfile(profile); err != nil {
				editionErr = fmt.Errorf("edition %q: %w", key, err)
				return
			}
			normalized[string(profile.Edition)] = profile
		}
		editionData.Editions = normalized
	})
	return editionErr
}

func validateEditionProfile(profile EditionProfile) error {
	if profile.Edition == "" {
		return fmt.Errorf("missing edition")
	}
	if profile.DeployMode == "" {
		return fmt.Errorf("missing deploy_mode")
	}
	if profile.LicenseClass == "" {
		return fmt.Errorf("missing license_class")
	}
	if profile.Providers.Auth == "" || profile.Providers.Billing == "" || profile.Providers.Storage == "" || profile.Providers.AI == "" || profile.Providers.ThreatIntel == "" {
		return fmt.Errorf("providers must include auth, billing, storage, ai, and threat_intel")
	}
	if profile.CommercialBoundary.Distribution == "" || profile.CommercialBoundary.LicenseMode == "" || profile.CommercialBoundary.EntitlementSource == "" || profile.CommercialBoundary.EvidenceAuthority == "" || profile.CommercialBoundary.PremiumExecution == "" || profile.CommercialBoundary.UpgradePath == "" || profile.CommercialBoundary.ReleaseGate == "" {
		return fmt.Errorf("commercial_boundary must include distribution, license_mode, entitlement_source, evidence_authority, premium_execution, upgrade_path, and release_gate")
	}
	if err := validateEditionProviderBoundary(profile); err != nil {
		return err
	}
	return nil
}

func validateEditionProviderBoundary(profile EditionProfile) error {
	required := map[Edition]EditionProviders{
		EditionCommunity: {
			Auth:        "local_jwt",
			Billing:     "none",
			Storage:     "local_fs",
			AI:          "rules_only",
			ThreatIntel: "offline_bundle",
		},
		EditionSaaS: {
			Auth:        "firebase",
			Billing:     "stripe",
			Storage:     "gcs",
			AI:          "openai",
			ThreatIntel: "online_feed",
		},
		EditionEnterpriseCloud: {
			Auth:        "enterprise_jwt",
			Billing:     "offline_license",
			Storage:     "gcs",
			AI:          "openai",
			ThreatIntel: "online_feed",
		},
		EditionSelfHostedOnline: {
			Auth:        "enterprise_jwt",
			Billing:     "offline_license",
			Storage:     "minio",
			AI:          "openai",
			ThreatIntel: "online_feed",
		},
		EditionEnterpriseAirgap: {
			Auth:        "enterprise_jwt",
			Billing:     "offline_license",
			Storage:     "minio",
			AI:          "local_openai_compatible",
			ThreatIntel: "offline_bundle",
		},
	}

	expected, ok := required[profile.Edition]
	if !ok {
		return fmt.Errorf("unsupported edition")
	}
	if profile.DeployMode != string(profile.Edition) {
		return fmt.Errorf("deploy_mode %q must match edition %q", profile.DeployMode, profile.Edition)
	}
	if profile.Providers != expected {
		return fmt.Errorf("provider boundary drift: got %+v, want %+v", profile.Providers, expected)
	}
	if err := validateEditionCommercialBoundary(profile); err != nil {
		return err
	}
	return nil
}

func validateEditionCommercialBoundary(profile EditionProfile) error {
	required := map[Edition]EditionCommercialBoundary{
		EditionCommunity: {
			Distribution:      "self_hosted_open_core",
			LicenseMode:       "none",
			EntitlementSource: "local_capability_snapshot",
			EvidenceAuthority: "local_evidence_pack",
			PremiumExecution:  "disabled_fail_closed",
			UpgradePath:       "enterprise_cloud_bridge_or_airgap",
			ReleaseGate:       "ce_release_tree",
		},
		EditionSaaS: {
			Distribution:      "hosted_saas",
			LicenseMode:       "subscription",
			EntitlementSource: "stripe_entitlement",
			EvidenceAuthority: "managed_signed_evidence",
			PremiumExecution:  "managed_flyto_runtime",
			UpgradePath:       "enterprise_contract",
			ReleaseGate:       "github_actions_and_cloud_release",
		},
		EditionEnterpriseCloud: {
			Distribution:      "managed_enterprise_cloud",
			LicenseMode:       "enterprise_license",
			EntitlementSource: "contract_or_cloud_entitlement",
			EvidenceAuthority: "managed_signed_evidence",
			PremiumExecution:  "enterprise_cloud_bridge",
			UpgradePath:       "enterprise_airgap",
			ReleaseGate:       "github_actions_and_enterprise_release",
		},
		EditionSelfHostedOnline: {
			Distribution:      "customer_self_hosted_online",
			LicenseMode:       "enterprise_license",
			EntitlementSource: "signed_license",
			EvidenceAuthority: "local_or_bridge_signed_evidence",
			PremiumExecution:  "customer_runner_or_bridge",
			UpgradePath:       "enterprise_airgap",
			ReleaseGate:       "self_hosted_release_packet",
		},
		EditionEnterpriseAirgap: {
			Distribution:      "customer_airgap",
			LicenseMode:       "offline_license",
			EntitlementSource: "signed_offline_license",
			EvidenceAuthority: "offline_signed_evidence",
			PremiumExecution:  "private_runner_bundle",
			UpgradePath:       "offline_support_contract",
			ReleaseGate:       "airgap_release_packet",
		},
	}
	expected, ok := required[profile.Edition]
	if !ok {
		return fmt.Errorf("unsupported edition")
	}
	if profile.CommercialBoundary != expected {
		return fmt.Errorf("commercial boundary drift: got %+v, want %+v", profile.CommercialBoundary, expected)
	}
	return nil
}

func EditionProfileByName(name string) (EditionProfile, error) {
	if err := loadEditions(); err != nil {
		return EditionProfile{}, err
	}
	edition := normalizeEditionName(name)
	profile, ok := editionData.Editions[edition]
	if !ok {
		return EditionProfile{}, fmt.Errorf("unknown edition %q", name)
	}
	return cloneEditionProfile(profile), nil
}

func CurrentEditionProfile() EditionProfile {
	profile, err := CurrentEditionProfileWithError()
	if err == nil {
		return profile
	}
	fallback, fallbackErr := EditionProfileByName(string(EditionSaaS))
	if fallbackErr == nil {
		return fallback
	}
	return EditionProfile{
		Edition:      EditionSaaS,
		DeployMode:   string(EditionSaaS),
		LicenseClass: LicenseClassCommercial,
		Providers: EditionProviders{
			Auth:        "firebase",
			Billing:     "stripe",
			Storage:     "gcs",
			AI:          "openai",
			ThreatIntel: "online_feed",
		},
		CommercialBoundary: EditionCommercialBoundary{
			Distribution:      "hosted_saas",
			LicenseMode:       "subscription",
			EntitlementSource: "stripe_entitlement",
			EvidenceAuthority: "managed_signed_evidence",
			PremiumExecution:  "managed_flyto_runtime",
			UpgradePath:       "enterprise_contract",
			ReleaseGate:       "github_actions_and_cloud_release",
		},
	}
}

func CurrentEditionProfileWithError() (EditionProfile, error) {
	edition, explicit := currentEditionName()
	if explicit {
		return EditionProfileByName(edition)
	}
	return EditionProfileByName(string(EditionSaaS))
}

func ApplyCurrentEditionProfile(caps Capabilities) Capabilities {
	return ApplyEditionProfile(caps, CurrentEditionProfile())
}

func ApplyEditionProfile(caps Capabilities, profile EditionProfile) Capabilities {
	caps.Edition = string(profile.Edition)
	caps.DeployMode = profile.DeployMode
	caps.Providers = profile.Providers
	caps.LicenseClass = string(profile.LicenseClass)
	caps.CommercialBoundary = profile.CommercialBoundary
	caps.HiddenSurfaces = sortedUnique(profile.HiddenSurfaces)
	caps.UnsupportedActions = sortedUnique(profile.UnsupportedActions)

	if caps.Surfaces == nil {
		caps.Surfaces = map[string]SurfaceAccess{}
	}
	for _, surface := range caps.HiddenSurfaces {
		caps.Surfaces[surface] = SurfaceAccess{
			State:           PageStateHidden,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          fmt.Sprintf("Hidden in %s edition.", caps.Edition),
		}
	}

	if caps.Actions == nil {
		caps.Actions = map[string]ActionAccess{}
	}
	for _, action := range caps.UnsupportedActions {
		caps.Actions[action] = ActionAccess{
			State:           ActionStateBlocked,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          fmt.Sprintf("Unsupported in %s edition.", caps.Edition),
		}
	}
	return caps
}

func currentEditionName() (string, bool) {
	for _, envName := range []string{"FLYTO_EDITION", "FLYTO_DEPLOY_MODE", "DEPLOYMENT_MODE"} {
		if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
			return value, true
		}
	}
	return string(EditionSaaS), false
}

func normalizeEditionName(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	normalized = strings.NewReplacer("-", "_", " ", "_").Replace(normalized)
	switch normalized {
	case "", "cloud", "firebase", "saas":
		return string(EditionSaaS)
	case "enterprise_cloud", "enterprisecloud", "enterprise_saas", "managed_enterprise":
		return string(EditionEnterpriseCloud)
	case "oss", "open_source", "opensource", "community":
		return string(EditionCommunity)
	case "selfhosted", "self_hosted", "self_hosted_online":
		return string(EditionSelfHostedOnline)
	case "airgap", "enterprise", "enterprise_airgap":
		return string(EditionEnterpriseAirgap)
	default:
		return normalized
	}
}

func cloneEditionProfile(profile EditionProfile) EditionProfile {
	profile.HiddenSurfaces = append([]string(nil), profile.HiddenSurfaces...)
	profile.UnsupportedActions = append([]string(nil), profile.UnsupportedActions...)
	return profile
}

func sortedUnique(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
