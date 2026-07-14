package access

import "strings"

type ScopeType string

const (
	ScopeWorkspace ScopeType = "workspace"
	ScopeOrg       ScopeType = "org"
	ScopeGlobal    ScopeType = "global"
)

type Surface string

const (
	SurfaceExternal  Surface = "external"
	SurfaceCode      Surface = "code"
	SurfaceCloud     Surface = "cloud"
	SurfaceContainer Surface = "container"
)

const (
	ActionAssetRead             = "asset:read"
	ActionAssetMerge            = "asset:merge"
	ActionScoreRead             = "score:read"
	ActionScoreConfigure        = "score:configure"
	ActionEvidenceRead          = "evidence:read"
	ActionSensitiveEvidenceRead = "sensitive_evidence:read"
	ActionSurfaceReadExternal   = "surface:read_external"
	ActionSurfaceReadCode       = "surface:read_code"
	ActionSurfaceReadCloud      = "surface:read_cloud"
	ActionSurfaceReadContainer  = "surface:read_container"
	ActionScanTriggerExternal   = "scan:trigger_external"
	ActionScanTriggerCode       = "scan:trigger_code"
	ActionScanTriggerCloud      = "scan:trigger_cloud"
	ActionScanTriggerContainer  = "scan:trigger_container"
	ActionScanTrigger           = "scan:trigger"    // generic automation trigger (member+)
	ActionAutofixOpenPR         = "autofix:open_pr" // request an AutoFix PR (member+)
	ActionRemediationRead       = "remediation:read"
	ActionRemediationPlan       = "remediation:plan"
	ActionRemediationApprove    = "remediation:approve"
	ActionRemediationApply      = "remediation:apply"
	ActionRemediationVerify     = "remediation:verify"
	ActionRemediationRollback   = "remediation:rollback"
	ActionDomainAdd             = "domain:add"
	ActionDomainRemove          = "domain:remove"
	ActionDomainValidate        = "domain:validate"
	ActionFindingUpdate         = "finding:update"
	ActionFindingVerify         = "finding:verify"
	ActionFindingIgnore         = "finding:ignore"
	ActionReportView            = "report:view"
	ActionReportExport          = "report:export"
	ActionReportManage          = "report:manage"
	ActionAccessAuditRead       = "access:audit_read"
	// Vendor (third-party risk) + campaign budget governance. Reads are
	// viewer+ (any org member may view); writes are member+ (viewers are
	// read-only by design).
	ActionVendorRead  = "vendor:read"
	ActionVendorWrite = "vendor:write"
	ActionBudgetRead  = "budget:read"
	ActionBudgetWrite = "budget:write"

	// ActionExternalIngest gates bulk ingestion of EXTERNAL vendor rating
	// feeds (Bitsight etc.) that write authoritative kernel state —
	// external_issue_tracker, external_issue_assets, threat_intel_cache. This
	// is distinct from (and stronger than) the member-level vendor:write
	// manual risk assessment: a feed ingest injects third-party "facts" into
	// the kernel, so it is admin+ only (audit AUTH-WRITE #4 — was the generic
	// member-level scan:trigger).
	ActionExternalIngest = "external:ingest"

	// ActionIntegrationConfigure gates configuring an Evidence Fusion data
	// source: wiring/upserting an org_integration, sealing a BYO vendor API
	// key, authoring custom mappings, and writing project-module source/billing
	// config. These are authoritative platform configuration writes (they
	// decide which sources feed the kernel and store the vendor credentials the
	// trusted ingest path uses), so — like external:ingest — they are admin+
	// only, NOT the member-level vendor:write they used to share (audit
	// AUTH-WRITE: fusion mutations were member-level).
	ActionIntegrationConfigure = "integration:configure"

	// ActionMCPConfigure gates configuring the MCP Runtime Guardian: writing the
	// per-org policy (rollout mode, target matchers, approved scopes), changing an
	// MCP server's lifecycle status (approve/suspend/retire), and classifying a
	// tool. These decide what the guardian enforces against agent tool calls, so —
	// like integration:configure — they are admin+ only (audit AUTH-WRITE).
	ActionMCPConfigure = "mcp:configure"

	// ActionPentestRun gates launching a pentest/DAST scan against a target.
	// This is the active-traffic consent gate — it is admin+ only (granted in
	// capabilities.yaml roles), matching the frontend GatedButton action=
	// "pentest:run". The handler previously checked only the surface feature,
	// letting any member trigger a scan; this constant closes that gap.
	ActionPentestCreate = "pentest:create"
	ActionPentestRun    = "pentest:run"
	ActionPentestDelete = "pentest:delete"

	// ActionPentestApproveScan gates approving/denying a queued scan-approval
	// request — the human safety gate before an active scan runs. Admin+ only,
	// matching the frontend GatedButton; handlers previously checked only the
	// surface feature so any member could approve.
	ActionPentestApproveScan = "pentest:approve_scan"

	// ActionFindingImport gates importing an external scanner's findings
	// (SARIF today; Trivy-JSON next) onto the platform's finding model. The
	// importer upserts authoritative finding rows (code_alerts) keyed on a
	// scanner-derived fingerprint — injecting third-party "facts" into the
	// consolidation layer that drive SLA / scoring / remediation. Like
	// external:ingest (bulk vendor-feed ingest), this is admin+ only (audit
	// AUTH-WRITE): a member must not be able to inject arbitrary findings.
	ActionFindingImport = "finding:import"
)

type Principal struct {
	UserID      string
	Role        string
	Features    []string
	Permissions []string
}

type Resource struct {
	Type        string
	ID          string
	Surface     Surface
	Visibility  string
	Sensitivity string
}

type Request struct {
	Principal       Principal
	ScopeType       ScopeType
	ScopeID         string
	Action          string
	RequiredFeature string
	Resource        Resource
}

type Decision struct {
	Allow           bool   `json:"allow"`
	Reason          string `json:"reason"`
	RequiredFeature string `json:"required_feature,omitempty"`
	RequiredAction  string `json:"required_action,omitempty"`
	AuditRequired   bool   `json:"audit_required,omitempty"`
}

func Require(req Request) Decision {
	if strings.TrimSpace(req.Principal.UserID) == "" {
		return deny("unauthenticated", "", "")
	}
	if req.ScopeType != ScopeGlobal && strings.TrimSpace(req.ScopeID) == "" {
		return deny("missing_scope", "", "")
	}
	if req.RequiredFeature != "" && !contains(req.Principal.Features, req.RequiredFeature) {
		return deny("feature_required", req.RequiredFeature, "")
	}
	if req.Action != "" && !contains(req.Principal.Permissions, req.Action) {
		return deny("action_required", "", req.Action)
	}
	if sensitive(req.Resource.Sensitivity) && !contains(req.Principal.Permissions, ActionSensitiveEvidenceRead) {
		return Decision{
			Allow:          false,
			Reason:         "sensitive_evidence_required",
			RequiredAction: ActionSensitiveEvidenceRead,
			AuditRequired:  true,
		}
	}
	return Decision{Allow: true, Reason: "allow", AuditRequired: sensitive(req.Resource.Sensitivity)}
}

func deny(reason, feature, action string) Decision {
	return Decision{
		Allow:           false,
		Reason:          reason,
		RequiredFeature: feature,
		RequiredAction:  action,
	}
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func sensitive(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "secret", "restricted", "confidential", "sensitive":
		return true
	default:
		return false
	}
}
