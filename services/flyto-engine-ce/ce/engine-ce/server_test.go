package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthIncludesCERuntimeBoundary(t *testing.T) {
	resetCEEnv(t)

	handler := newCEServer(func() time.Time {
		return time.Date(2026, 7, 15, 1, 2, 3, 0, time.UTC)
	}).handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "req-ce-test")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("X-Request-ID"); got != "req-ce-test" {
		t.Fatalf("X-Request-ID = %q", got)
	}
	var body map[string]any
	decodeJSON(t, rec, &body)
	if body["product"] != productName || body["service"] != serviceName {
		t.Fatalf("unexpected health identity: %#v", body)
	}
	if body["source_mode"] != sourceMode {
		t.Fatalf("source_mode = %v", body["source_mode"])
	}
}

func TestModulesExposeCEAndEnterpriseBoundary(t *testing.T) {
	resetCEEnv(t)
	rec := getJSON("/api/v1/ce/modules")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Summary map[string]int  `json:"summary"`
		Modules []moduleSummary `json:"modules"`
	}
	decodeJSON(t, rec, &body)
	if body.Summary["ce_included"] < 8 {
		t.Fatalf("expected useful CE module count, got %#v", body.Summary)
	}
	if body.Summary["enterprise_addon"]+body.Summary["enterprise_only"] < 4 {
		t.Fatalf("expected gated enterprise module count, got %#v", body.Summary)
	}
	if len(body.Modules) == 0 {
		t.Fatal("expected module list")
	}
	for _, module := range body.Modules {
		if module.CEValue == "" || module.EnterpriseValue == "" || module.UpgradeTrigger == "" {
			t.Fatalf("module %q missing boundary fields: %#v", module.Key, module)
		}
	}
}

func TestCapabilitiesDefaultToCommunityLiveAndFailClosedActions(t *testing.T) {
	resetCEEnv(t)

	rec := getJSON("/api/v1/ce/capabilities")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Capabilities struct {
			Edition     string `json:"edition"`
			BillingMode string `json:"billing_mode"`
			Role        string `json:"role"`
		} `json:"capabilities"`
		Checks map[string]bool `json:"checks"`
	}
	decodeJSON(t, rec, &body)
	if body.Capabilities.Edition != "community" {
		t.Fatalf("edition = %q", body.Capabilities.Edition)
	}
	if body.Capabilities.BillingMode != "live" {
		t.Fatalf("billing_mode = %q", body.Capabilities.BillingMode)
	}
	if body.Capabilities.Role != "viewer" {
		t.Fatalf("role = %q", body.Capabilities.Role)
	}
	if !body.Checks["has_surface_external"] || !body.Checks["has_surface_code"] {
		t.Fatalf("expected baseline visible surfaces, checks=%#v", body.Checks)
	}
	if body.Checks["can_trigger_scan"] {
		t.Fatalf("viewer must not be able to trigger scans: %#v", body.Checks)
	}
}

func TestProductLoopIsDeterministicCEClosedLoop(t *testing.T) {
	resetCEEnv(t)
	rec := getJSON("/api/v1/ce/product-loop")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body ceProductLoopResponse
	decodeJSON(t, rec, &body)
	if body.Schema != "flyto.engine-ce-product-loop.v1" {
		t.Fatalf("schema = %q", body.Schema)
	}
	if body.DataMode != "deterministic_demo_seed" || body.ProviderExecution != "none" {
		t.Fatalf("CE product loop must not claim live provider success: %#v", body)
	}
	requiredSurfaces := map[string]bool{
		"code": false, "container": false, "cloud": false, "runtime": false, "external": false,
	}
	for _, asset := range body.Assets {
		if _, ok := requiredSurfaces[asset.Surface]; ok {
			requiredSurfaces[asset.Surface] = true
		}
	}
	for surface, present := range requiredSurfaces {
		if !present {
			t.Fatalf("missing CE loop surface %q in %#v", surface, body.Assets)
		}
	}
	if body.Summary.FindingCount != len(body.Findings) ||
		body.Summary.EvidenceCount != len(body.Evidence) ||
		body.Summary.RemediationCount != len(body.Remediation) ||
		body.Summary.ValidationCount != len(body.Validation) {
		t.Fatalf("summary counts drifted: %#v", body.Summary)
	}
	if body.Summary.AttackPathCount == 0 || len(body.Summary.ImpactedAssets) == 0 {
		t.Fatalf("expected attack path and impacted assets: %#v", body.Summary)
	}
	if body.SLA.TotalOpen == 0 || body.SLA.GeneratedAt.IsZero() {
		t.Fatalf("expected SLA aging report: %#v", body.SLA)
	}
	if len(body.MergeContract.MergeThrough) < 4 {
		t.Fatalf("expected merge contract for unified cockpit: %#v", body.MergeContract)
	}
	paidOverlaySeen := false
	for _, overlay := range body.EnterpriseOverlay {
		if overlay.Capability == "live_cloud_remediation" && overlay.CEBehavior == "manual_control_plan" {
			paidOverlaySeen = true
		}
	}
	if !paidOverlaySeen {
		t.Fatalf("expected enterprise overlay boundary in %#v", body.EnterpriseOverlay)
	}
}

func TestAccessSelfTestShowsAllowDenyAndAudit(t *testing.T) {
	resetCEEnv(t)
	rec := getJSON("/api/v1/ce/access/self-test")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Decisions []accessDecisionSummary `json:"decisions"`
	}
	decodeJSON(t, rec, &body)
	byName := map[string]accessDecisionSummary{}
	for _, decision := range body.Decisions {
		byName[decision.Name] = decision
	}
	if !byName["viewer_reads_evidence"].Decision.Allow {
		t.Fatalf("viewer evidence read should allow: %#v", byName["viewer_reads_evidence"])
	}
	if byName["viewer_cannot_trigger_scan"].Decision.Allow {
		t.Fatalf("viewer scan trigger should deny: %#v", byName["viewer_cannot_trigger_scan"])
	}
	if !byName["admin_can_trigger_scan"].Decision.Allow {
		t.Fatalf("admin scan trigger should allow: %#v", byName["admin_can_trigger_scan"])
	}
	if !byName["admin_secret_evidence_requires_audit"].Decision.AuditRequired {
		t.Fatalf("secret evidence should require audit: %#v", byName["admin_secret_evidence_requires_audit"])
	}
}

func TestCapabilitiesRejectInvalidQuery(t *testing.T) {
	resetCEEnv(t)
	rec := getJSON("/api/v1/ce/capabilities?role=root")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestMethodsAreFailClosed(t *testing.T) {
	resetCEEnv(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ce/modules", nil)
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Allow"); got != http.MethodGet {
		t.Fatalf("Allow = %q", got)
	}
}

func getJSON(path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)
	return rec
}

func decodeJSON(t *testing.T, rec *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode json: %v; body=%s", err, rec.Body.String())
	}
}

func resetCEEnv(t *testing.T) {
	t.Helper()
	t.Setenv("FLYTO_EDITION", "")
	t.Setenv("FLYTO_DEPLOY_MODE", "")
	t.Setenv("DEPLOYMENT_MODE", "")
	t.Setenv("FLYTO_BILLING_MODE", "")
}
