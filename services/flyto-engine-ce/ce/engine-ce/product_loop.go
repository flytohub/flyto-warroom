package main

import (
	"time"

	"github.com/flytohub/flyto-engine/internal/resource"
	"github.com/flytohub/flyto-engine/internal/severity"
	"github.com/flytohub/flyto-engine/internal/sla"
)

type ceProductLoopResponse struct {
	Schema            string                `json:"schema"`
	Product           string                `json:"product"`
	Edition           string                `json:"edition"`
	DataMode          string                `json:"data_mode"`
	ProviderExecution string                `json:"provider_execution"`
	Scope             ceLoopScope           `json:"scope"`
	Summary           ceLoopSummary         `json:"summary"`
	Assets            []ceLoopAsset         `json:"assets"`
	Findings          []ceLoopFinding       `json:"findings"`
	AttackPaths       []ceLoopAttackPath    `json:"attack_paths"`
	Evidence          []ceLoopEvidence      `json:"evidence"`
	Remediation       []ceLoopRemediation   `json:"remediation"`
	Validation        []ceLoopValidation    `json:"validation"`
	SLA               sla.AgingReport       `json:"sla"`
	MergeContract     ceLoopMergeContract   `json:"merge_contract"`
	EnterpriseOverlay []ceEnterpriseOverlay `json:"enterprise_overlay"`
	GeneratedAt       string                `json:"generated_at"`
}

type ceLoopScope struct {
	WorkspaceID string   `json:"workspace_id"`
	OrgID       string   `json:"org_id"`
	Surfaces    []string `json:"surfaces"`
	SafeMode    string   `json:"safe_mode"`
}

type ceLoopSummary struct {
	AssetCount       int      `json:"asset_count"`
	FindingCount     int      `json:"finding_count"`
	AttackPathCount  int      `json:"attack_path_count"`
	EvidenceCount    int      `json:"evidence_count"`
	RemediationCount int      `json:"remediation_count"`
	ValidationCount  int      `json:"validation_count"`
	ImpactedAssets   []string `json:"impacted_assets"`
}

type ceLoopAsset struct {
	ID      string `json:"id"`
	Surface string `json:"surface"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Project string `json:"project"`
	Source  string `json:"source"`
}

type ceLoopFinding struct {
	ID          string `json:"id"`
	AssetID     string `json:"asset_id"`
	Surface     string `json:"surface"`
	Title       string `json:"title"`
	Severity    string `json:"severity"`
	Fingerprint string `json:"fingerprint"`
	State       string `json:"state"`
	Source      string `json:"source"`
}

type ceLoopAttackPath struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	FindingIDs  []string `json:"finding_ids"`
	AssetPath   []string `json:"asset_path"`
	SafeCheck   string   `json:"safe_check"`
	BlockedByCE []string `json:"blocked_by_ce,omitempty"`
}

type ceLoopEvidence struct {
	ID          string   `json:"id"`
	FindingID   string   `json:"finding_id"`
	Kind        string   `json:"kind"`
	Replayable  bool     `json:"replayable"`
	Artifacts   []string `json:"artifacts"`
	Signature   string   `json:"signature"`
	Redaction   string   `json:"redaction"`
	GeneratedBy string   `json:"generated_by"`
}

type ceLoopRemediation struct {
	ID         string   `json:"id"`
	FindingID  string   `json:"finding_id"`
	Mode       string   `json:"mode"`
	Target     string   `json:"target"`
	Steps      []string `json:"steps"`
	RequiresAI bool     `json:"requires_ai"`
	RequiresEE bool     `json:"requires_enterprise"`
	SafetyGate string   `json:"safety_gate"`
}

type ceLoopValidation struct {
	ID             string `json:"id"`
	FindingID      string `json:"finding_id"`
	Method         string `json:"method"`
	BeforeEvidence string `json:"before_evidence"`
	AfterEvidence  string `json:"after_evidence"`
	Result         string `json:"result"`
}

type ceLoopMergeContract struct {
	SplitBy       []string `json:"split_by"`
	MergeThrough  []string `json:"merge_through"`
	Authoritative string   `json:"authoritative"`
}

type ceEnterpriseOverlay struct {
	Capability  string `json:"capability"`
	CEBehavior  string `json:"ce_behavior"`
	PaidOverlay string `json:"paid_overlay"`
}

func buildCEProductLoop(now time.Time) ceProductLoopResponse {
	assets := []ceLoopAsset{
		{ID: "repo:checkout-api", Surface: "code", Type: "repository", Name: "checkout-api", Project: "warroom-demo", Source: "local_repo_import"},
		{ID: "image:checkout-api", Surface: "container", Type: "container_image", Name: "checkout-api:demo", Project: "warroom-demo", Source: "dockerfile_analysis"},
		{ID: "cloud:aws-demo", Surface: "cloud", Type: "cloud_account", Name: "aws-demo", Project: "warroom-demo", Source: "manual_inventory"},
		{ID: "runtime:checkout-api", Surface: "runtime", Type: "service", Name: "checkout-api", Project: "warroom-demo", Source: "runtime_inventory"},
		{ID: "external:app.flyto2.local", Surface: "external", Type: "domain", Name: "app.flyto2.local", Project: "warroom-demo", Source: "footprint_discovery"},
	}
	findings := []ceLoopFinding{
		{ID: "finding:code-osv-rce", AssetID: "repo:checkout-api", Surface: "code", Title: "Reachable dependency advisory", Severity: severity.Normalize("high").String(), Fingerprint: "fp:code:osv:checkout-api:demo", State: "open", Source: "osv_import"},
		{ID: "finding:container-root", AssetID: "image:checkout-api", Surface: "container", Title: "Container runs as root", Severity: severity.Normalize("medium").String(), Fingerprint: "fp:container:root-user:checkout-api:demo", State: "open", Source: "dockerfile_analysis"},
		{ID: "finding:cloud-public-egress", AssetID: "cloud:aws-demo", Surface: "cloud", Title: "Broad outbound egress policy", Severity: severity.Normalize("moderate").String(), Fingerprint: "fp:cloud:egress:aws-demo:demo", State: "open", Source: "manual_inventory"},
		{ID: "finding:external-missing-hsts", AssetID: "external:app.flyto2.local", Surface: "external", Title: "Missing HSTS on public endpoint", Severity: severity.Normalize("low").String(), Fingerprint: "fp:external:hsts:app.flyto2.local:demo", State: "open", Source: "safe_http_probe"},
	}
	edges := []resource.GraphEdge{
		{SourceID: "repo:checkout-api", TargetID: "image:checkout-api"},
		{SourceID: "image:checkout-api", TargetID: "runtime:checkout-api"},
		{SourceID: "runtime:checkout-api", TargetID: "external:app.flyto2.local"},
		{SourceID: "runtime:checkout-api", TargetID: "cloud:aws-demo"},
	}
	impacted := resource.FindImpacted("repo:checkout-api", edges, 3)
	evidence := []ceLoopEvidence{
		{ID: "evidence:code-osv-rce", FindingID: "finding:code-osv-rce", Kind: "package_graph", Replayable: true, Artifacts: []string{"dependency-path.json", "reachability-trace.json"}, Signature: "ce-demo-sig-code-osv-rce", Redaction: "no_secrets", GeneratedBy: "ce_kernel"},
		{ID: "evidence:container-root", FindingID: "finding:container-root", Kind: "dockerfile_snapshot", Replayable: true, Artifacts: []string{"Dockerfile.snapshot", "build-context-manifest.json"}, Signature: "ce-demo-sig-container-root", Redaction: "path_only", GeneratedBy: "ce_kernel"},
		{ID: "evidence:external-missing-hsts", FindingID: "finding:external-missing-hsts", Kind: "http_header_probe", Replayable: true, Artifacts: []string{"request.json", "response-headers.json"}, Signature: "ce-demo-sig-external-hsts", Redaction: "headers_only", GeneratedBy: "safe_http_probe"},
	}
	remediation := []ceLoopRemediation{
		{ID: "remediation:code-osv-rce", FindingID: "finding:code-osv-rce", Mode: "deterministic_patch_plan", Target: "package_manifest", Steps: []string{"pin fixed version", "rerun package extraction", "verify fingerprint disappearance"}, RequiresAI: false, RequiresEE: false, SafetyGate: "human_review_required"},
		{ID: "remediation:container-root", FindingID: "finding:container-root", Mode: "deterministic_patch_plan", Target: "Dockerfile", Steps: []string{"add non-root user", "set USER before entrypoint", "rebuild image and rerun container check"}, RequiresAI: false, RequiresEE: false, SafetyGate: "human_review_required"},
		{ID: "remediation:cloud-public-egress", FindingID: "finding:cloud-public-egress", Mode: "manual_control_plan", Target: "cloud_policy", Steps: []string{"narrow egress destinations", "apply in customer account", "import updated policy evidence"}, RequiresAI: false, RequiresEE: true, SafetyGate: "enterprise_connector_required"},
	}
	validation := []ceLoopValidation{
		{ID: "validation:code-osv-rce", FindingID: "finding:code-osv-rce", Method: "fingerprint_disappearance", BeforeEvidence: "evidence:code-osv-rce", AfterEvidence: "evidence:code-osv-rce:after", Result: "ready_to_verify"},
		{ID: "validation:container-root", FindingID: "finding:container-root", Method: "definition_replay", BeforeEvidence: "evidence:container-root", AfterEvidence: "evidence:container-root:after", Result: "ready_to_verify"},
	}
	aging := sla.AgeBuckets([]sla.FindingAge{
		{Severity: "HIGH", FirstSeenAt: now.AddDate(0, 0, -9), SLABreachAt: now.AddDate(0, 0, -2)},
		{Severity: "MEDIUM", FirstSeenAt: now.AddDate(0, 0, -4), SLABreachAt: now.AddDate(0, 0, 10)},
		{Severity: "LOW", FirstSeenAt: now.AddDate(0, 0, -1), SLABreachAt: now.AddDate(0, 0, 29)},
	}, now)

	return ceProductLoopResponse{
		Schema:            "flyto.engine-ce-product-loop.v1",
		Product:           productName,
		Edition:           "community",
		DataMode:          "deterministic_demo_seed",
		ProviderExecution: "none",
		Scope: ceLoopScope{
			WorkspaceID: "ce-demo-workspace",
			OrgID:       "ce-demo-org",
			Surfaces:    []string{"code", "container", "cloud", "runtime", "external"},
			SafeMode:    "non_destructive_read_only",
		},
		Summary: ceLoopSummary{
			AssetCount:       len(assets),
			FindingCount:     len(findings),
			AttackPathCount:  1,
			EvidenceCount:    len(evidence),
			RemediationCount: len(remediation),
			ValidationCount:  len(validation),
			ImpactedAssets:   impacted.AffectedIDs,
		},
		Assets:   assets,
		Findings: findings,
		AttackPaths: []ceLoopAttackPath{
			{
				ID:          "attack-path:repo-to-public-runtime",
				Title:       "Repository risk can reach public runtime",
				FindingIDs:  []string{"finding:code-osv-rce", "finding:container-root", "finding:external-missing-hsts"},
				AssetPath:   []string{"repo:checkout-api", "image:checkout-api", "runtime:checkout-api", "external:app.flyto2.local"},
				SafeCheck:   "read_only_replay",
				BlockedByCE: []string{"live_cloud_remediation", "hosted_runner_callback"},
			},
		},
		Evidence:    evidence,
		Remediation: remediation,
		Validation:  validation,
		SLA:         aging,
		MergeContract: ceLoopMergeContract{
			SplitBy:       []string{"capability", "surface", "resource", "evidence_contract", "api_contract"},
			MergeThrough:  []string{"unified_cockpit", "pulse", "score", "timeline", "evidence_graph", "cross_surface_correlation"},
			Authoritative: "engine_capability_and_evidence_contract",
		},
		EnterpriseOverlay: []ceEnterpriseOverlay{
			{Capability: "live_cloud_remediation", CEBehavior: "manual_control_plan", PaidOverlay: "enterprise_cloud_connector"},
			{Capability: "commercial_threat_intel", CEBehavior: "import_contract_only", PaidOverlay: "managed_threat_feed"},
			{Capability: "autofix_promotion_rollback", CEBehavior: "deterministic_patch_plan", PaidOverlay: "enterprise_approval_and_rollback_orchestration"},
			{Capability: "immutable_audit_export", CEBehavior: "local_evidence_summary", PaidOverlay: "enterprise_audit_ledger"},
		},
		GeneratedAt: now.Format(time.RFC3339),
	}
}
