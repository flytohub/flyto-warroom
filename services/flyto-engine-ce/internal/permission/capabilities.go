// Package permission — capabilities resolver.
//
// `engine.go` (already in this package) covers L2-L6: role, visibility,
// sensitivity, audit. `capabilities.go` adds L1 (org entitlement: tier
// + plan + features) and L7 (UI page gating derived from features).
//
// The resolver loads `config/capabilities.yaml` once at startup and
// exposes a single function:
//
//	Resolve(org, role) → Capabilities
//
// Capabilities is what the `/api/v1/me/capabilities` endpoint returns
// to the frontend. The frontend filters nav + guards routes purely
// from this JSON — no entitlement logic on the client side.
//
// This file does NOT enforce permissions on API requests. Per-endpoint
// enforcement lives in the handler (using `HasPermission(role, action)`
// for action gates, and `HasFeature(caps, feature)` for entitlement
// gates). Both are cheap reads against the in-memory matrix.
package permission

import (
	_ "embed"
	"fmt"
	"os"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

//go:embed capabilities.yaml
var capabilitiesYAML []byte

// Tier is the product package the org pays for.
type Tier string

const (
	TierCode         Tier = "code"
	TierCTEM         Tier = "ctem"
	TierCodeCTEM     Tier = "code_ctem"
	TierCodeCTEMCSPM Tier = "code_ctem_cspm"
)

// Plan is the billing tier — gates "premium" features that aren't in
// the base tier (SSO, compliance, AI fix plan, …).
type Plan string

const (
	PlanFree       Plan = "free"
	PlanStarter    Plan = "starter"
	PlanPro        Plan = "pro"
	PlanTeam       Plan = "team"
	PlanEnterprise Plan = "enterprise"
)

// BillingMode controls whether commercial paywalls are enforced. Preview is
// intentionally the default so test/beta deployments can exercise the whole
// product before Stripe/offline licensing is turned on.
type BillingMode string

const (
	BillingModePreview BillingMode = "preview"
	BillingModeLive    BillingMode = "live"
)

func CurrentBillingMode() BillingMode {
	return normalizeBillingMode(BillingMode(os.Getenv("FLYTO_BILLING_MODE")))
}

func normalizeBillingMode(mode BillingMode) BillingMode {
	switch BillingMode(strings.ToLower(strings.TrimSpace(string(mode)))) {
	case BillingModeLive:
		return BillingModeLive
	default:
		return BillingModePreview
	}
}

// ProjectType is the per-org user-picked filter on top of entitlement.
// Intersects with tier+plan+features so a paying org can host
// multiple per-purpose project views without buying extra tiers.
type ProjectType string

const (
	ProjectTypeAll    ProjectType = "all"
	ProjectTypeCode   ProjectType = "code"
	ProjectTypeCTEM   ProjectType = "ctem"
	ProjectTypeCloud  ProjectType = "cloud"
	ProjectTypeCustom ProjectType = "custom"
)

// Capabilities is the resolved capability snapshot for one (user, org)
// pair. JSON-serialised verbatim to the frontend; field names are
// snake_case to match the rest of the API contract.
type Capabilities struct {
	Tier               Tier                      `json:"tier"`
	Plan               Plan                      `json:"plan"`
	BillingMode        BillingMode               `json:"billing_mode"`
	Role               Role                      `json:"role"`
	ProjectType        ProjectType               `json:"project_type"`
	Features           []string                  `json:"features"`
	VisiblePages       []string                  `json:"visible_pages"`
	Permissions        []string                  `json:"permissions"`
	Edition            string                    `json:"edition,omitempty"`
	DeployMode         string                    `json:"deploy_mode,omitempty"`
	Providers          EditionProviders          `json:"providers,omitempty"`
	LicenseClass       string                    `json:"license_class,omitempty"`
	CommercialBoundary EditionCommercialBoundary `json:"commercial_boundary,omitempty"`
	HiddenSurfaces     []string                  `json:"hidden_surfaces,omitempty"`
	UnsupportedActions []string                  `json:"unsupported_actions,omitempty"`
	// Surfaces is the SaaS product-level contract. Pages describe routes;
	// surfaces describe sellable product areas that can be bundled, locked
	// behind add-ons/credits, or hidden when not relevant to the org.
	Surfaces map[string]SurfaceAccess `json:"surfaces,omitempty"`
	// PageStates is the commercial visibility contract. `visible_pages`
	// stays as the legacy enabled-page list for backward compatibility;
	// new clients should use this tri-state map instead.
	PageStates map[string]PageAccess `json:"page_states,omitempty"`
	// Actions is the commercial execution contract. RBAC remains in
	// Permissions; this layer answers whether a paid/add-on/metered
	// action may actually run.
	Actions  map[string]ActionAccess `json:"actions,omitempty"`
	Meters   map[string]MeterState   `json:"meters,omitempty"`
	Paywalls map[string]Paywall      `json:"paywalls,omitempty"`
	// Caps from plan (seat / repo / domain).
	SeatCap   int `json:"seat_cap"`
	RepoCap   int `json:"repo_cap"`
	DomainCap int `json:"domain_cap"`
}

const (
	PageStateEnabled       = "enabled"
	PageStateLockedPreview = "locked_preview"
	PageStateHidden        = "hidden"

	ActionStateAllowed         = "allowed"
	ActionStatePaymentRequired = "payment_required"
	ActionStateBlocked         = "blocked"

	BillingBehaviorIncluded      = "included"
	BillingBehaviorAddonRequired = "addon_required"
	BillingBehaviorMetered       = "metered"
	BillingBehaviorCredit        = "credit_required"
	BillingBehaviorBlocked       = "blocked"

	CommercialActionReportBuild   = "report.build"
	CommercialActionReportExport  = "report.export"
	CommercialActionScanRun       = "scan.run"
	CommercialActionRedTeamRun    = "redteam.run"
	CommercialActionDarkweb       = "darkweb.monitor"
	CommercialActionAIChat        = "ai.chat"
	CommercialActionAIFix         = "ai.fix"
	CommercialActionAIReport      = "ai.report"
	CommercialActionAIRedTeam     = "ai.redteam.plan"
	CommercialActionAIAgentTool   = "ai.agent_tool.call"
	CommercialActionAIWorkflow    = "ai.workflow_mcp.call"
	CommercialActionEvidence      = "evidence.export"
	CommercialActionWarroomVerify = "warroom.verify"
)

type PageAccess struct {
	State           string `json:"state"`
	Reason          string `json:"reason,omitempty"`
	RequiredFeature string `json:"required_feature,omitempty"`
	RequiredSKU     string `json:"required_sku,omitempty"`
	PaywallKey      string `json:"paywall_key,omitempty"`
}

type SurfaceAccess struct {
	State           string `json:"state"`
	BillingBehavior string `json:"billing_behavior,omitempty"`
	Reason          string `json:"reason,omitempty"`
	RequiredFeature string `json:"required_feature,omitempty"`
	RequiredSKU     string `json:"required_sku,omitempty"`
	PaywallKey      string `json:"paywall_key,omitempty"`
}

type ActionAccess struct {
	State           string `json:"state"`
	BillingBehavior string `json:"billing_behavior,omitempty"`
	Reason          string `json:"reason,omitempty"`
	RequiredAction  string `json:"required_action,omitempty"`
	RequiredFeature string `json:"required_feature,omitempty"`
	RequiredSKU     string `json:"required_sku,omitempty"`
	PaywallKey      string `json:"paywall_key,omitempty"`
}

type MeterState struct {
	BillingBehavior string `json:"billing_behavior,omitempty"`
	Quota           int    `json:"quota,omitempty"`
	Used            int    `json:"used,omitempty"`
	Remaining       int    `json:"remaining,omitempty"`
}

type Paywall struct {
	Title           string `json:"title"`
	Message         string `json:"message"`
	CTAKey          string `json:"cta_key"`
	RequiredFeature string `json:"required_feature,omitempty"`
	RequiredSKU     string `json:"required_sku,omitempty"`
}

type tierConfig struct {
	Label    string   `yaml:"label"`
	Desc     string   `yaml:"desc"`
	Features []string `yaml:"features"`
}

type planConfig struct {
	Label        string   `yaml:"label"`
	SeatCap      int      `yaml:"seat_cap"`
	RepoCap      int      `yaml:"repo_cap"`
	DomainCap    int      `yaml:"domain_cap"`
	PlanFeatures []string `yaml:"plan_features"`
}

type pageConfig struct {
	Requires []string `yaml:"requires"`
	Always   bool     `yaml:"always"`
}

type roleConfig struct {
	Label       string   `yaml:"label"`
	Inherits    string   `yaml:"inherits"`
	Permissions []string `yaml:"permissions"`
}

type matrix struct {
	Tiers map[string]tierConfig `yaml:"tiers"`
	Plans map[string]planConfig `yaml:"plans"`
	Pages map[string]pageConfig `yaml:"pages"`
	Roles map[string]roleConfig `yaml:"roles"`
}

var (
	loadOnce sync.Once
	loaded   matrix
	loadErr  error
)

func load() error {
	loadOnce.Do(func() {
		if err := yaml.Unmarshal(capabilitiesYAML, &loaded); err != nil {
			loadErr = fmt.Errorf("capabilities yaml: %w", err)
		}
	})
	return loadErr
}

// Resolve combines tier+plan+org-features+role into the snapshot the
// frontend renders from. `orgFeatures` are explicit overrides stored
// per-org (e.g. a customer who's on Pro but specifically purchased
// CSPM addon would have "cspm" added here). Pass nil if none.
func Resolve(tier Tier, plan Plan, role Role, orgFeatures []string) (Capabilities, error) {
	return ResolveWithBillingMode(tier, plan, role, orgFeatures, CurrentBillingMode())
}

func ResolveWithBillingMode(tier Tier, plan Plan, role Role, orgFeatures []string, billingMode BillingMode) (Capabilities, error) {
	if err := load(); err != nil {
		return Capabilities{}, err
	}

	tCfg, ok := loaded.Tiers[string(tier)]
	if !ok {
		return Capabilities{}, fmt.Errorf("unknown tier %q", tier)
	}
	pCfg, ok := loaded.Plans[string(plan)]
	if !ok {
		return Capabilities{}, fmt.Errorf("unknown plan %q", plan)
	}

	// Compose feature set: tier defaults + plan extras + per-org overrides.
	// dedupe via a set; preserve order via a separate slice so the JSON
	// output is stable across requests (frontend snapshot-testing happy).
	seen := map[string]struct{}{}
	features := make([]string, 0, len(tCfg.Features)+len(pCfg.PlanFeatures)+len(orgFeatures))
	add := func(f string) {
		if _, dup := seen[f]; dup {
			return
		}
		seen[f] = struct{}{}
		features = append(features, f)
	}
	for _, f := range tCfg.Features {
		add(f)
	}
	for _, f := range pCfg.PlanFeatures {
		add(f)
	}
	for _, f := range orgFeatures {
		add(f)
	}

	// Pages: include if `always` is true, OR every required feature is in `features`.
	visible := make([]string, 0, len(loaded.Pages))
	for id, pg := range loaded.Pages {
		if pg.Always {
			visible = append(visible, id)
			continue
		}
		ok := true
		for _, req := range pg.Requires {
			if _, has := seen[req]; !has {
				ok = false
				break
			}
		}
		if ok {
			visible = append(visible, id)
		}
	}

	// Role permissions: resolve `inherits` chain. Owner→admin→member→viewer→guest.
	perms := resolveRolePerms(string(role), map[string]struct{}{})

	return decorateCommercial(Capabilities{
		Tier:         tier,
		Plan:         plan,
		BillingMode:  normalizeBillingMode(billingMode),
		Role:         role,
		ProjectType:  ProjectTypeAll, // overlay with ResolveWithProjectType
		Features:     features,
		VisiblePages: visible,
		Permissions:  perms,
		SeatCap:      pCfg.SeatCap,
		RepoCap:      pCfg.RepoCap,
		DomainCap:    pCfg.DomainCap,
	}), nil
}

// codeFeatures + ctemFeatures define what `code` / `ctem` project_type
// keeps. Always-on conveniences (compliance, notification, SSO,
// reports infra) appear in BOTH so picking a pillar doesn't break
// management features.
var codeFeatures = map[string]struct{}{
	"surface_code": {}, "surface_container": {},
	"scoring_unified": {},
	"code_audit":      {}, "sast": {}, "sca": {}, "secrets": {}, "iac": {},
	"autofix": {}, "reachability": {}, "ai_fix_plan": {}, "red_team": {},
	"vuln_mgmt":          {}, // unified CVE view — vulns exist on the code pillar too
	"identity":           {}, // BYO IdP posture — cross-cutting, survives either pillar
	"mcp":                {}, // MCP Guardian read surface — cross-cutting
	"runtime_protection": {},
	"compliance":         {}, "executive_report": {}, "report_export": {},
	"email_notification": {}, "slack_notification": {}, "webhook": {},
	"sso": {}, "audit_export": {}, "private_runner": {}, "dedicated_support": {},
}

var ctemFeatures = map[string]struct{}{
	"surface_external": {},
	"ctem":             {}, "attack_surface": {}, "posture_scoring": {},
	"asset_map": {}, "scoring_unified": {},
	"sla_tracking": {}, "mttr_tracking": {}, "threat_feed": {},
	"supply_chain": {}, "brand_protection": {}, "continuous_monitoring": {},
	"vuln_mgmt":     {}, // unified CVE view — vulns exist on the ctem pillar too
	"identity":      {}, // BYO IdP posture — cross-cutting, survives either pillar
	"mcp":           {}, // MCP Guardian read surface — cross-cutting
	"darkweb_intel": {},
	"compliance":    {}, "executive_report": {}, "report_export": {},
	"email_notification": {}, "slack_notification": {}, "webhook": {},
	"sso": {}, "audit_export": {}, "private_runner": {}, "dedicated_support": {},
}

// cloudFeatures defines what the `cloud` project_type keeps — the Cloud
// CSPM pillar surface. Mirrors codeFeatures/ctemFeatures: the cloud
// surface set + the cross-cutting features that survive any pillar +
// the management conveniences shared by every pillar.
//
// Intentionally EXCLUDES code-only (sast/sca/secrets/iac/code_audit/
// autofix/reachability/...) and ctem-only (surface_external/ctem/
// attack_surface/asset_map/posture_scoring/sla_tracking/mttr_tracking/
// threat_feed/supply_chain/brand_protection/continuous_monitoring).
// Like the other single-pillar sets, pulse / cross_dim_correlation drop
// out — they're inherently cross-dim.
var cloudFeatures = map[string]struct{}{
	"surface_cloud": {}, "cspm": {}, "surface_container": {},
	"vuln_mgmt":       {}, // unified CVE view — cloud findings land here too
	"scoring_unified": {},
	"identity":        {}, // BYO IdP posture — cross-cutting, survives either pillar
	"mcp":             {}, // MCP Guardian read surface — cross-cutting
	"compliance":      {}, "executive_report": {}, "report_export": {},
	"email_notification": {}, "slack_notification": {}, "webhook": {},
	"sso": {}, "audit_export": {}, "private_runner": {}, "dedicated_support": {},
}

// applyProjectType filters `features` down to what `pt` permits.
// `customAllowed` is the explicit whitelist for `custom`; ignored
// for the other types. Pulse / cross_dim_correlation deliberately
// don't appear in either single-pillar set — they're inherently
// cross-dim, so picking one type drops them.
func applyProjectType(features []string, pt ProjectType, customAllowed []string) []string {
	if pt == "" || pt == ProjectTypeAll {
		return features
	}
	var allowed map[string]struct{}
	switch pt {
	case ProjectTypeCode:
		allowed = codeFeatures
	case ProjectTypeCTEM:
		allowed = ctemFeatures
	case ProjectTypeCloud:
		allowed = cloudFeatures
	case ProjectTypeCustom:
		allowed = make(map[string]struct{}, len(customAllowed))
		for _, f := range customAllowed {
			allowed[f] = struct{}{}
		}
		// A custom set that spans BOTH the code pillar AND the external
		// pillar is effectively "combined" — restore the cross-dim
		// features that are never individually selectable in the project
		// wizard (pulse / cross_dim_correlation). Without this, a custom
		// org that enables every pillar still loses Pulse, because Pulse
		// is a derived cross-dim surface, not a pickable module. Mirrors
		// the tier-level rule "pulse: cross-dim only when both sides present".
		_, hasCode := allowed["surface_code"]
		if !hasCode {
			_, hasCode = allowed["code_audit"]
		}
		_, hasExternal := allowed["surface_external"]
		if !hasExternal {
			_, hasExternal = allowed["ctem"]
		}
		if hasCode && hasExternal {
			allowed["pulse"] = struct{}{}
			allowed["cross_dim_correlation"] = struct{}{}
		}
	default:
		return features
	}
	out := make([]string, 0, len(features))
	for _, f := range features {
		if _, ok := allowed[f]; ok {
			out = append(out, f)
		}
	}
	return out
}

// ResolveWithProjectType applies the per-org project_type filter on
// top of Resolve. Features + visible_pages narrow to the intersection
// of (a) what the tier+plan permits and (b) what project_type allows.
// `customFeatures` is consulted only when pt == custom; nil/empty
// with custom yields the "always" pages only — UI should treat that
// as "setup not finished" rather than data loss.
func ResolveWithProjectType(tier Tier, plan Plan, role Role, orgFeatures []string, pt ProjectType, customFeatures []string) (Capabilities, error) {
	caps, err := Resolve(tier, plan, role, orgFeatures)
	if err != nil {
		return caps, err
	}
	if pt == "" {
		pt = ProjectTypeAll
	}
	caps.ProjectType = pt
	if pt == ProjectTypeAll {
		return caps, nil
	}

	caps.Features = applyProjectType(caps.Features, pt, customFeatures)
	allowed := make(map[string]struct{}, len(caps.Features))
	for _, f := range caps.Features {
		allowed[f] = struct{}{}
	}
	if err := load(); err != nil {
		return caps, err
	}
	visible := make([]string, 0, len(loaded.Pages))
	for id, pg := range loaded.Pages {
		if pg.Always {
			visible = append(visible, id)
			continue
		}
		ok := true
		for _, req := range pg.Requires {
			if _, has := allowed[req]; !has {
				ok = false
				break
			}
		}
		if ok {
			visible = append(visible, id)
		}
	}
	caps.VisiblePages = visible
	return decorateCommercial(caps), nil
}

type commercialPageGate struct {
	baseFeature       string
	requiredFeature   string
	requiredSKU       string
	paywallKey        string
	lockedDescription string
}

var commercialPageGates = map[string]commercialPageGate{
	"pentest": {
		baseFeature:       "code_audit",
		requiredFeature:   "red_team",
		requiredSKU:       "flyto_red_team_monthly",
		paywallKey:        "red_team",
		lockedDescription: "Red-team and active pentest execution require the Red Team add-on.",
	},
	"brand_protection": {
		baseFeature:       "surface_external",
		requiredFeature:   "brand_protection",
		requiredSKU:       "flyto_brand_protection_monthly",
		paywallKey:        "brand_protection",
		lockedDescription: "Brand, subsidiary, and impersonation monitoring require the Brand Protection add-on.",
	},
	"threat_intel": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
	"threat_actors": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
	"malware_families": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
	"ransomware_incidents": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
	"ioc_lookup": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
	"sensor_map": {
		baseFeature:       "ctem",
		requiredFeature:   "darkweb_intel",
		requiredSKU:       "flyto_darkweb_monthly",
		paywallKey:        "darkweb_intel",
		lockedDescription: "Darkweb and threat-intelligence monitoring require the Darkweb add-on.",
	},
}

func decorateCommercial(caps Capabilities) Capabilities {
	caps.BillingMode = normalizeBillingMode(caps.BillingMode)
	features := makeStringSet(caps.Features)
	visible := makeStringSet(caps.VisiblePages)
	permissions := makeStringSet(caps.Permissions)

	caps.Surfaces = resolveSurfaces(features)
	caps.PageStates = resolvePageStates(features, visible)
	caps.Paywalls = defaultPaywalls()
	caps.Actions = resolveCommercialActions(features, permissions)
	caps.Meters = resolveMeters(caps, features)
	if caps.BillingMode == BillingModePreview {
		caps = applyBillingPreview(caps, permissions)
	}
	return ApplyCurrentEditionProfile(caps)
}

func applyBillingPreview(caps Capabilities, permissions map[string]struct{}) Capabilities {
	for key, access := range caps.Surfaces {
		if access.State != PageStateHidden && isPaymentBillingBehavior(access.BillingBehavior) {
			access.State = PageStateEnabled
			access.BillingBehavior = BillingBehaviorIncluded
			access.Reason = "Billing is disabled during preview."
			caps.Surfaces[key] = access
		}
	}

	for key, access := range caps.PageStates {
		if access.State == PageStateLockedPreview && (access.PaywallKey != "" || access.RequiredFeature != "" || access.RequiredSKU != "") {
			access.State = PageStateEnabled
			access.Reason = "Billing is disabled during preview."
			caps.PageStates[key] = access
		}
	}

	for key, access := range caps.Actions {
		if access.State == ActionStateBlocked {
			continue
		}
		if access.State == ActionStatePaymentRequired {
			requiredAction := commercialPreviewRequiredAction(key)
			if requiredAction != "" && !hasSetValue(permissions, requiredAction) {
				access.State = ActionStateBlocked
				access.BillingBehavior = BillingBehaviorBlocked
				access.Reason = "The current role is not allowed to use this preview action."
				access.RequiredAction = requiredAction
				caps.Actions[key] = access
				continue
			}
			access.State = ActionStateAllowed
			access.BillingBehavior = BillingBehaviorIncluded
			access.Reason = "Billing is disabled during preview."
			caps.Actions[key] = access
			continue
		}
		if isPaymentBillingBehavior(access.BillingBehavior) {
			access.BillingBehavior = BillingBehaviorIncluded
			access.Reason = "Billing is disabled during preview."
			caps.Actions[key] = access
		}
	}

	for key, meter := range caps.Meters {
		if isPaymentBillingBehavior(meter.BillingBehavior) {
			meter.BillingBehavior = BillingBehaviorIncluded
			caps.Meters[key] = meter
		}
	}
	caps.Paywalls = map[string]Paywall{}
	return caps
}

func isPaymentBillingBehavior(behavior string) bool {
	switch behavior {
	case BillingBehaviorAddonRequired, BillingBehaviorMetered, BillingBehaviorCredit:
		return true
	default:
		return false
	}
}

func commercialPreviewRequiredAction(action string) string {
	switch action {
	case CommercialActionReportBuild, CommercialActionReportExport, "report:export", CommercialActionAIReport, CommercialActionEvidence:
		return "report:export"
	case CommercialActionRedTeamRun, "pentest:run", CommercialActionAIRedTeam:
		return "pentest:run"
	case CommercialActionDarkweb, "darkweb:monitor":
		return "darkweb:monitor"
	case CommercialActionAIChat, CommercialActionAIFix, CommercialActionAIAgentTool, CommercialActionAIWorkflow:
		return "autofix:open_pr"
	default:
		return ""
	}
}

func resolveSurfaces(features map[string]struct{}) map[string]SurfaceAccess {
	hasAnyBaseProduct := hasAnySetValue(features, "surface_code", "code_audit", "surface_external", "ctem", "surface_cloud", "cspm", "surface_container")
	enabled := func() SurfaceAccess {
		return SurfaceAccess{State: PageStateEnabled, BillingBehavior: BillingBehaviorIncluded}
	}
	hidden := func() SurfaceAccess {
		return SurfaceAccess{State: PageStateHidden, BillingBehavior: BillingBehaviorBlocked}
	}
	locked := func(behavior, reason, feature, sku, paywall string) SurfaceAccess {
		return SurfaceAccess{
			State:           PageStateLockedPreview,
			BillingBehavior: behavior,
			Reason:          reason,
			RequiredFeature: feature,
			RequiredSKU:     sku,
			PaywallKey:      paywall,
		}
	}

	surfaces := map[string]SurfaceAccess{
		"code":               hidden(),
		"external_ctem":      hidden(),
		"darkweb":            hidden(),
		"subsidiary_brand":   hidden(),
		"cloud_cspm":         hidden(),
		"container_runtime":  hidden(),
		"ai":                 hidden(),
		"reports_compliance": hidden(),
	}

	if hasAnySetValue(features, "surface_code", "code_audit") {
		surfaces["code"] = enabled()
	}
	if hasAnySetValue(features, "surface_external", "ctem") {
		surfaces["external_ctem"] = enabled()
	}
	if hasSetValue(features, "darkweb_intel") {
		surfaces["darkweb"] = enabled()
	} else if hasAnySetValue(features, "surface_external", "ctem") {
		surfaces["darkweb"] = locked(BillingBehaviorAddonRequired,
			"Darkweb monitoring requires the Darkweb add-on or Enterprise bundle.",
			"darkweb_intel", "flyto_darkweb_monthly", "darkweb_intel")
	}
	if hasSetValue(features, "brand_protection") {
		surfaces["subsidiary_brand"] = enabled()
	} else if hasAnySetValue(features, "surface_external", "ctem") {
		surfaces["subsidiary_brand"] = locked(BillingBehaviorAddonRequired,
			"Brand, subsidiary, and impersonation monitoring require the Brand Protection add-on.",
			"brand_protection", "flyto_brand_protection_monthly", "brand_protection")
	}
	if hasSetValue(features, "cspm") {
		surfaces["cloud_cspm"] = enabled()
	} else if hasSetValue(features, "surface_cloud") {
		surfaces["cloud_cspm"] = locked(BillingBehaviorAddonRequired,
			"Cloud posture management requires the CSPM add-on or Full Platform bundle.",
			"cspm", "flyto_cspm_monthly", "cloud_cspm")
	}
	if hasAnySetValue(features, "surface_container", "runtime_protection") {
		surfaces["container_runtime"] = enabled()
	}
	if hasSetValue(features, "ai_fix_plan") {
		surfaces["ai"] = enabled()
	} else if hasSetValue(features, "ai_credits") {
		surfaces["ai"] = SurfaceAccess{
			State:           PageStateEnabled,
			BillingBehavior: BillingBehaviorCredit,
			RequiredFeature: "ai_credits",
			RequiredSKU:     "flyto_ai_credits_pack",
			PaywallKey:      "ai_credits",
		}
	} else if hasAnyBaseProduct {
		surfaces["ai"] = locked(BillingBehaviorCredit,
			"AI workflows require an AI add-on or available AI credits.",
			"ai_fix_plan", "flyto_ai_credits_pack", "ai_credits")
	}
	if hasAnySetValue(features, "report_export", "executive_report", "compliance") {
		surfaces["reports_compliance"] = enabled()
	} else if hasAnyBaseProduct {
		surfaces["reports_compliance"] = locked(BillingBehaviorAddonRequired,
			"Reports, compliance evidence, and exports require a report add-on or Pro plan.",
			"report_export", "flyto_report_export_monthly", "report_export")
	}
	return surfaces
}

func resolvePageStates(features, visible map[string]struct{}) map[string]PageAccess {
	states := make(map[string]PageAccess, len(loaded.Pages))
	for id := range loaded.Pages {
		state := PageStateHidden
		if _, ok := visible[id]; ok {
			state = PageStateEnabled
		}
		access := PageAccess{State: state}

		if gate, ok := commercialPageGates[id]; ok {
			baseOK := gate.baseFeature == "" || hasSetValue(features, gate.baseFeature)
			commercialOK := gate.requiredFeature == "" || hasSetValue(features, gate.requiredFeature)
			if baseOK && !commercialOK {
				access = PageAccess{
					State:           PageStateLockedPreview,
					Reason:          gate.lockedDescription,
					RequiredFeature: gate.requiredFeature,
					RequiredSKU:     gate.requiredSKU,
					PaywallKey:      gate.paywallKey,
				}
			}
		}

		states[id] = access
	}
	return states
}

func resolveCommercialActions(features, permissions map[string]struct{}) map[string]ActionAccess {
	actions := map[string]ActionAccess{}
	put := func(action string, access ActionAccess, aliases ...string) {
		actions[action] = access
		for _, alias := range aliases {
			actions[alias] = access
		}
	}

	reportAccess := ActionAccess{
		State:           ActionStateAllowed,
		BillingBehavior: BillingBehaviorIncluded,
	}
	if !hasAnySetValue(features, "report_export", "executive_report") {
		reportAccess = ActionAccess{
			State:           ActionStatePaymentRequired,
			BillingBehavior: BillingBehaviorAddonRequired,
			Reason:          "Report generation and export require a report add-on, Pro plan, or included Enterprise bundle.",
			RequiredFeature: "report_export",
			RequiredSKU:     "flyto_report_export_monthly",
			PaywallKey:      "report_export",
		}
	} else if !hasSetValue(permissions, "report:export") {
		reportAccess = ActionAccess{
			State:           ActionStateBlocked,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          "The current role is not allowed to export reports.",
			RequiredAction:  "report:export",
		}
	}
	put(CommercialActionReportBuild, reportAccess)
	put(CommercialActionReportExport, reportAccess, "report:export")

	put(CommercialActionScanRun, roleActionAccess(permissions, "scan:trigger",
		"The current role is not allowed to run scans."), "scan:trigger")
	put(CommercialActionWarroomVerify, roleActionAccess(permissions, "scan:trigger",
		"The current role is not allowed to run deterministic product verification."), "warroom:verify")
	put("scan.code.run", roleActionAccess(permissions, "scan:trigger_code",
		"The current role is not allowed to run code scans."), "scan:trigger_code")
	put("scan.external.run", roleActionAccess(permissions, "scan:trigger_external",
		"The current role is not allowed to run external scans."), "scan:trigger_external")
	put("scan.cloud.run", roleActionAccess(permissions, "scan:trigger_cloud",
		"The current role is not allowed to run cloud scans."), "scan:trigger_cloud")
	put("scan.container.run", roleActionAccess(permissions, "scan:trigger_container",
		"The current role is not allowed to run container scans."), "scan:trigger_container")

	redTeamAccess := ActionAccess{
		State:           ActionStateAllowed,
		BillingBehavior: BillingBehaviorIncluded,
	}
	if !hasSetValue(features, "red_team") {
		redTeamAccess = ActionAccess{
			State:           ActionStatePaymentRequired,
			BillingBehavior: BillingBehaviorAddonRequired,
			Reason:          "Active red-team and pentest execution require the Red Team add-on or Enterprise bundle.",
			RequiredFeature: "red_team",
			RequiredSKU:     "flyto_red_team_monthly",
			PaywallKey:      "red_team",
		}
	} else if !hasSetValue(permissions, "pentest:run") {
		redTeamAccess = ActionAccess{
			State:           ActionStateBlocked,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          "The current role is not allowed to run active pentest scans.",
			RequiredAction:  "pentest:run",
		}
	}
	put(CommercialActionRedTeamRun, redTeamAccess, "pentest:run")

	darkwebAccess := addonAction(features, permissions, "darkweb_intel", "flyto_darkweb_monthly", "darkweb_intel",
		"Darkweb monitoring requires the Darkweb add-on or Enterprise bundle.",
		"darkweb:monitor", "The current role is not allowed to configure darkweb monitoring.")
	put(CommercialActionDarkweb, darkwebAccess, "darkweb.monitor", "darkweb:monitor")

	aiAccess := addonAction(features, permissions, "ai_fix_plan", "flyto_ai_fix_monthly", "ai_fix_plan",
		"AI remediation requires an AI add-on or a plan that includes AI.",
		"autofix:open_pr", "The current role is not allowed to request AI remediation.")
	put(CommercialActionAIChat, aiAccess, "ai.chat")
	put(CommercialActionAIFix, aiAccess, "ai.fix")
	put(CommercialActionAIAgentTool, aiAccess, "ai.agent_tool.call")
	put(CommercialActionAIWorkflow, aiAccess, "ai.workflow_mcp.call")

	aiReportAccess := ActionAccess{
		State:           ActionStateAllowed,
		BillingBehavior: BillingBehaviorIncluded,
	}
	if hasSetValue(features, "ai_credits") && !hasSetValue(features, "report_export") {
		aiReportAccess = ActionAccess{
			State:           ActionStateAllowed,
			BillingBehavior: BillingBehaviorCredit,
			Reason:          "AI report generation will consume AI credits.",
			RequiredFeature: "ai_credits",
			RequiredSKU:     "flyto_ai_credits_pack",
			PaywallKey:      "ai_credits",
		}
	} else if !hasSetValue(features, "report_export") {
		aiReportAccess = ActionAccess{
			State:           ActionStatePaymentRequired,
			BillingBehavior: BillingBehaviorCredit,
			Reason:          "AI report generation requires report entitlement or AI credits.",
			RequiredSKU:     "flyto_ai_credits_pack",
			PaywallKey:      "ai_credits",
		}
	} else if !hasSetValue(permissions, "report:export") {
		aiReportAccess = ActionAccess{
			State:           ActionStateBlocked,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          "The current role is not allowed to generate AI reports.",
			RequiredAction:  "report:export",
		}
	}
	put(CommercialActionAIReport, aiReportAccess, "ai.report")

	aiRedTeamAccess := addonAction(features, permissions, "red_team", "flyto_red_team_monthly", "red_team",
		"AI red-team planning requires the Red Team add-on or Enterprise bundle.",
		"pentest:run", "The current role is not allowed to run AI red-team planning.")
	put(CommercialActionAIRedTeam, aiRedTeamAccess, "ai.redteam.plan")

	evidenceAccess := addonAction(features, permissions, "report_export", "flyto_report_export_monthly", "report_export",
		"Evidence export requires report/export entitlement.",
		"report:export", "The current role is not allowed to export evidence.")
	put(CommercialActionEvidence, evidenceAccess, "evidence.export")

	return actions
}

func roleActionAccess(permissions map[string]struct{}, action, reason string) ActionAccess {
	if hasSetValue(permissions, action) {
		return ActionAccess{
			State:           ActionStateAllowed,
			BillingBehavior: BillingBehaviorIncluded,
		}
	}
	return ActionAccess{
		State:           ActionStateBlocked,
		BillingBehavior: BillingBehaviorBlocked,
		Reason:          reason,
		RequiredAction:  action,
	}
}

func addonAction(features, permissions map[string]struct{}, feature, sku, key, reason, requiredAction, roleReason string) ActionAccess {
	if !hasSetValue(features, feature) {
		return ActionAccess{
			State:           ActionStatePaymentRequired,
			BillingBehavior: BillingBehaviorAddonRequired,
			Reason:          reason,
			RequiredFeature: feature,
			RequiredSKU:     sku,
			PaywallKey:      key,
		}
	}
	if requiredAction != "" && !hasSetValue(permissions, requiredAction) {
		return ActionAccess{
			State:           ActionStateBlocked,
			BillingBehavior: BillingBehaviorBlocked,
			Reason:          roleReason,
			RequiredAction:  requiredAction,
		}
	}
	return ActionAccess{
		State:           ActionStateAllowed,
		BillingBehavior: BillingBehaviorIncluded,
	}
}

func resolveMeters(caps Capabilities, features map[string]struct{}) map[string]MeterState {
	reportBehavior := BillingBehaviorAddonRequired
	if hasAnySetValue(features, "report_export", "executive_report") {
		reportBehavior = BillingBehaviorIncluded
	}
	aiBehavior := BillingBehaviorCredit
	if hasSetValue(features, "ai_fix_plan") {
		aiBehavior = BillingBehaviorIncluded
	}
	return map[string]MeterState{
		"repos": {
			BillingBehavior: BillingBehaviorIncluded,
			Quota:           caps.RepoCap,
		},
		"domains": {
			BillingBehavior: BillingBehaviorIncluded,
			Quota:           caps.DomainCap,
		},
		"reports": {
			BillingBehavior: reportBehavior,
		},
		"ai": {
			BillingBehavior: aiBehavior,
		},
		"ai.tokens": {
			BillingBehavior: aiBehavior,
		},
		"ai.requests": {
			BillingBehavior: aiBehavior,
		},
	}
}

func defaultPaywalls() map[string]Paywall {
	return map[string]Paywall{
		"report_export": {
			Title:           "Unlock report export",
			Message:         "Build, export, and download customer-ready evidence reports.",
			CTAKey:          "buy_report_export",
			RequiredFeature: "report_export",
			RequiredSKU:     "flyto_report_export_monthly",
		},
		"red_team": {
			Title:           "Unlock Red Team",
			Message:         "Run active pentest and adversary-emulation workflows with approval gates.",
			CTAKey:          "buy_red_team",
			RequiredFeature: "red_team",
			RequiredSKU:     "flyto_red_team_monthly",
		},
		"darkweb_intel": {
			Title:           "Unlock Darkweb intelligence",
			Message:         "Monitor leaked credentials, IOCs, ransomware activity, and threat catalogs.",
			CTAKey:          "buy_darkweb",
			RequiredFeature: "darkweb_intel",
			RequiredSKU:     "flyto_darkweb_monthly",
		},
		"brand_protection": {
			Title:           "Unlock Brand Protection",
			Message:         "Track impersonation, typosquats, subsidiary exposure, and takedown evidence.",
			CTAKey:          "buy_brand_protection",
			RequiredFeature: "brand_protection",
			RequiredSKU:     "flyto_brand_protection_monthly",
		},
		"cloud_cspm": {
			Title:           "Unlock Cloud posture",
			Message:         "Monitor cloud posture, IAM exposure, and CSPM findings from the same Flyto2 workspace.",
			CTAKey:          "buy_cloud_cspm",
			RequiredFeature: "cspm",
			RequiredSKU:     "flyto_cspm_monthly",
		},
		"ai_fix_plan": {
			Title:           "Unlock AI remediation",
			Message:         "Generate fix plans and AI-assisted remediation for validated findings.",
			CTAKey:          "buy_ai_fix",
			RequiredFeature: "ai_fix_plan",
			RequiredSKU:     "flyto_ai_fix_monthly",
		},
		"ai_credits": {
			Title:       "Add AI credits",
			Message:     "Use credits for AI report generation, narrative polish, and metered AI workflows.",
			CTAKey:      "buy_ai_credits",
			RequiredSKU: "flyto_ai_credits_pack",
		},
	}
}

func makeStringSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		set[value] = struct{}{}
	}
	return set
}

func hasSetValue(set map[string]struct{}, value string) bool {
	_, ok := set[value]
	return ok
}

func hasAnySetValue(set map[string]struct{}, values ...string) bool {
	for _, value := range values {
		if hasSetValue(set, value) {
			return true
		}
	}
	return false
}

// resolveRolePerms walks the `inherits` chain to flatten the permission
// list for one role. `seenRoles` guards against an accidental cycle in
// the YAML (e.g. owner→admin→owner would otherwise infinite-loop).
func resolveRolePerms(role string, seenRoles map[string]struct{}) []string {
	if _, dup := seenRoles[role]; dup {
		return nil
	}
	seenRoles[role] = struct{}{}

	rCfg, ok := loaded.Roles[role]
	if !ok {
		return nil
	}
	out := append([]string(nil), rCfg.Permissions...)
	if rCfg.Inherits != "" {
		out = append(out, resolveRolePerms(rCfg.Inherits, seenRoles)...)
	}
	// dedupe — a role + its parent can list the same perm
	seen := map[string]struct{}{}
	deduped := out[:0]
	for _, p := range out {
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		deduped = append(deduped, p)
	}
	return deduped
}

// HasFeature is the cheap entitlement check used by handlers that need
// to block an action because the org isn't on the right plan.
func HasFeature(caps Capabilities, feature string) bool {
	for _, f := range caps.Features {
		if f == feature {
			return true
		}
	}
	return false
}

// HasAction is the cheap RBAC check — does this role have permission
// to perform `action` (e.g. "pentest:run")?
func HasAction(caps Capabilities, action string) bool {
	for _, p := range caps.Permissions {
		if p == action {
			return true
		}
	}
	return false
}

func CommercialActionFor(caps Capabilities, action string) ActionAccess {
	if caps.Actions != nil {
		if access, ok := caps.Actions[action]; ok {
			return access
		}
	}
	return ActionAccess{
		State:           ActionStateBlocked,
		BillingBehavior: BillingBehaviorBlocked,
		Reason:          "unknown commercial action",
	}
}

// ReconcileCommercialActionsWithPermissions refreshes action-state entries
// after a caller has appended additive RBAC permissions to a resolved
// capability snapshot. It only reopens actions that were blocked solely by a
// missing RequiredAction; payment-required and edition-unsupported actions stay
// fail-closed.
func ReconcileCommercialActionsWithPermissions(caps Capabilities) Capabilities {
	if len(caps.Actions) == 0 || len(caps.Permissions) == 0 {
		return caps
	}
	permissions := makeStringSet(caps.Permissions)
	for action, access := range caps.Actions {
		if access.State != ActionStateBlocked || access.RequiredAction == "" {
			continue
		}
		if !hasSetValue(permissions, access.RequiredAction) {
			continue
		}
		access.State = ActionStateAllowed
		access.BillingBehavior = BillingBehaviorIncluded
		access.Reason = ""
		access.RequiredAction = ""
		caps.Actions[action] = access
	}
	return caps
}

func HasCommercialAction(caps Capabilities, action string) bool {
	return CommercialActionFor(caps, action).State == ActionStateAllowed
}
