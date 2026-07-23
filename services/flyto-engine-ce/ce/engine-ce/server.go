package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/access"
	"github.com/flytohub/flyto-engine/internal/ceauth"
	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/modulecatalog"
	"github.com/flytohub/flyto-engine/internal/obs"
	"github.com/flytohub/flyto-engine/internal/permission"
)

const (
	productName = "Flyto2 Warroom CE"
	serviceName = "engine-ce-source-runtime"
	sourceMode  = "complete_ce_source_runtime"
)

type ceServer struct {
	startedAt        time.Time
	now              func() time.Time
	store            *ceplatform.Store
	auth             *ceauth.Manager
	bootstrapLimiter *ipRateLimiter
	loginLimiter     *ipRateLimiter
}

func newHandler() http.Handler {
	ensureCEEnvironment()
	return newCEServer(time.Now).handler()
}

func newCEServer(now func() time.Time) *ceServer {
	if now == nil {
		now = time.Now
	}
	return &ceServer{startedAt: now().UTC(), now: now}
}

func (s *ceServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/readyz", s.handleReady)
	mux.HandleFunc("/api/v1/ce/boundary", s.handleBoundary)
	mux.HandleFunc("/api/v1/ce/modules", s.handleModules)
	mux.HandleFunc("/api/v1/ce/capabilities", s.handleCapabilities)
	mux.HandleFunc("/api/v1/ce/product-loop", s.handleProductLoop)
	mux.HandleFunc("/api/v1/ce/access/self-test", s.handleAccessSelfTest)
	mux.HandleFunc("/api/v1/auth/local/bootstrap", s.handleLocalBootstrap)
	mux.HandleFunc("/api/v1/auth/local/login", s.handleLocalLogin)
	mux.HandleFunc("/api/v1/me", s.handleMe)
	mux.HandleFunc("/api/v1/me/", s.handleMe)
	mux.HandleFunc("/api/v1/code/orgs", s.handleOrgs)
	mux.HandleFunc("/api/v1/code/orgs/", s.handleOrgRoutes)
	mux.HandleFunc("/api/v1/code/repos/", s.handleRepoRoutes)
	return requestContextMiddleware(mux)
}

func ensureCEEnvironment() {
	if strings.TrimSpace(os.Getenv("FLYTO_EDITION")) == "" &&
		strings.TrimSpace(os.Getenv("FLYTO_DEPLOY_MODE")) == "" &&
		strings.TrimSpace(os.Getenv("DEPLOYMENT_MODE")) == "" {
		_ = os.Setenv("FLYTO_EDITION", string(permission.EditionCommunity))
	}
	if strings.TrimSpace(os.Getenv("FLYTO_BILLING_MODE")) == "" {
		_ = os.Setenv("FLYTO_BILLING_MODE", string(permission.BillingModeLive))
	}
}

func requestContextMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = obs.NewID()
		}
		traceID := strings.TrimSpace(r.Header.Get("Traceparent"))
		if traceID == "" {
			traceID = requestID
		}
		ctx := obs.WithRequestID(r.Context(), requestID)
		ctx = obs.WithTraceID(ctx, traceID)
		w.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *ceServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeJSON(w, http.StatusNotFound, errorResponse{Error: "not_found"})
		return
	}
	if !allowGET(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"product": productName,
		"service": serviceName,
		"edition": "community",
		"links": []map[string]string{
			{"rel": "health", "href": "/healthz"},
			{"rel": "ready", "href": "/readyz"},
			{"rel": "boundary", "href": "/api/v1/ce/boundary"},
			{"rel": "modules", "href": "/api/v1/ce/modules"},
			{"rel": "capabilities", "href": "/api/v1/ce/capabilities"},
			{"rel": "product_loop", "href": "/api/v1/ce/product-loop"},
			{"rel": "access_self_test", "href": "/api/v1/ce/access/self-test"},
		},
	})
}

func (s *ceServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"product":     productName,
		"service":     serviceName,
		"edition":     "community",
		"source_mode": sourceMode,
		"started_at":  s.startedAt.Format(time.RFC3339),
		"now":         s.now().UTC().Format(time.RFC3339),
	})
}

func (s *ceServer) handleReady(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	catalog, err := modulecatalog.LoadEmbedded()
	if err != nil {
		obs.Logger(r.Context()).Error("CE module catalog readiness failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, errorResponse{Error: "not_ready", Details: err.Error()})
		return
	}
	if s.store != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.store.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, errorResponse{Error: "not_ready", Details: "postgres unavailable"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ready",
		"product":      productName,
		"service":      serviceName,
		"edition":      "community",
		"module_count": len(catalog.Modules),
	})
}

func (s *ceServer) handleBoundary(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":                "flyto.engine-ce-runtime-boundary.v1",
		"product":               productName,
		"service":               serviceName,
		"edition":               "community",
		"source_mode":           "complete_ce_source_runtime",
		"source_path":           "ce/engine-ce",
		"public_package":        "services/flyto-engine-ce",
		"public_runtime_routes": []string{"/health", "/readyz", "/api/v1/auth/local/bootstrap", "/api/v1/auth/local/login", "/api/v1/me", "/api/v1/code/orgs", "/api/v1/code/orgs/{id}/repos", "/api/v1/code/repos/{id}/scans", "/api/v1/code/repos/{id}/findings", "/api/v1/code/orgs/{id}/reports/build"},
		"authority_boundary": map[string]any{
			"runtime":                      "ce",
			"score_authority_signing":      "disabled",
			"public_comparable_ratings":    false,
			"firebase_rating_authority":    "private_saas_overlay_only",
			"licensed_authority_required":  true,
			"ce_public_rating_mode":        "local_external_non_comparable",
			"private_code_public_scoring":  "redacted_external_impact_only",
			"fail_closed_without_license":  true,
			"runtime_source_pull_allowed":  false,
			"public_tree_private_overlays": false,
		},
		"license_boundary": map[string]any{
			"license_mode":                  "none",
			"enterprise_overlay_activation": "disabled_in_ce",
			"commercial_provider_execution": "disabled",
			"live_remediation_execution":    "disabled",
			"hosted_control_plane":          "not_available_in_ce_runtime",
			"offline_enterprise_license":    "private_overlay_only",
		},
		"private_boundaries": []string{
			"billing, entitlement mutation, and license signers",
			"SaaS control plane, Firebase, Stripe, and hosted callbacks",
			"commercial threat intelligence and proprietary datasets",
			"live cloud, container, runtime, and AutoFix remediation adapters",
			"enterprise SSO/SAML/SCIM, legal hold, and airgap packaging internals",
		},
		"composition_contracts": []string{
			"capability snapshot",
			"module catalog",
			"resource kernel",
			"event/evidence contract",
			"API contract",
			"fusion contract",
		},
	})
}

func (s *ceServer) handleProductLoop(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, buildCEProductLoop(s.now().UTC()))
}

func (s *ceServer) handleModules(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	catalog, err := modulecatalog.LoadEmbedded()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "module_catalog_error", Details: err.Error()})
		return
	}
	modules := make([]moduleSummary, 0, len(catalog.Modules))
	counts := map[string]int{"total": len(catalog.Modules)}
	for _, module := range catalog.Modules {
		counts[module.Billing]++
		modules = append(modules, moduleSummary{
			Key:               module.Key,
			DisplayName:       module.DisplayName,
			TitleKey:          module.TitleKey,
			Category:          module.Category,
			RiskLevel:         module.RiskLevel,
			Status:            module.Status,
			LandingPath:       module.LandingPath,
			SourceSelectable:  module.SourceSelectable,
			FlytoNative:       module.FlytoNative,
			DefaultEnabled:    module.DefaultEnabled,
			CrossCutting:      module.CrossCutting,
			Billing:           module.Billing,
			Features:          sortedCopy(module.Features),
			GatingFeatures:    sortedCopy(module.GatingFeatures),
			Permissions:       sortedCopy(module.Permissions),
			CommercialActions: sortedCopy(module.CommercialActions),
			Pages:             sortedCopy(module.Pages),
			CEValue:           module.CEValue,
			EnterpriseValue:   module.EnterpriseValue,
			UpgradeTrigger:    module.UpgradeTrigger,
		})
	}
	sort.Slice(modules, func(i, j int) bool { return modules[i].Key < modules[j].Key })
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":  "flyto.engine-ce-modules.v1",
		"summary": counts,
		"modules": modules,
	})
}

func (s *ceServer) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	caps, err := resolveCapabilitiesFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid_capability_request", Details: err.Error()})
		return
	}
	normalizeCapabilities(&caps)
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":       "flyto.engine-ce-capabilities.v1",
		"capabilities": caps,
		"checks": map[string]bool{
			"has_surface_external": permission.HasFeature(caps, "surface_external"),
			"has_surface_code":     permission.HasFeature(caps, "surface_code"),
			"can_export_report":    permission.HasAction(caps, access.ActionReportExport),
			"can_trigger_scan":     permission.HasAction(caps, access.ActionScanTrigger),
		},
	})
}

func (s *ceServer) handleAccessSelfTest(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	viewer, err := permission.ResolveWithBillingMode(permission.TierCodeCTEMCSPM, permission.PlanFree, permission.RoleViewer, nil, permission.BillingModeLive)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "capability_error", Details: err.Error()})
		return
	}
	admin, err := permission.ResolveWithBillingMode(permission.TierCodeCTEMCSPM, permission.PlanFree, permission.RoleAdmin, nil, permission.BillingModeLive)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "capability_error", Details: err.Error()})
		return
	}

	tests := []accessDecisionSummary{
		{
			Name: "viewer_reads_evidence",
			Decision: access.Require(access.Request{
				Principal: principalFromCaps("ce-viewer", viewer),
				ScopeType: access.ScopeOrg,
				ScopeID:   "ce-demo-org",
				Action:    access.ActionEvidenceRead,
				Resource:  access.Resource{Type: "evidence_pack", ID: "demo", Surface: access.SurfaceExternal, Sensitivity: "internal"},
			}),
		},
		{
			Name: "viewer_cannot_trigger_scan",
			Decision: access.Require(access.Request{
				Principal: principalFromCaps("ce-viewer", viewer),
				ScopeType: access.ScopeOrg,
				ScopeID:   "ce-demo-org",
				Action:    access.ActionScanTrigger,
				Resource:  access.Resource{Type: "scan", ID: "demo", Surface: access.SurfaceExternal, Sensitivity: "internal"},
			}),
		},
		{
			Name: "admin_can_trigger_scan",
			Decision: access.Require(access.Request{
				Principal: principalFromCaps("ce-admin", admin),
				ScopeType: access.ScopeOrg,
				ScopeID:   "ce-demo-org",
				Action:    access.ActionScanTrigger,
				Resource:  access.Resource{Type: "scan", ID: "demo", Surface: access.SurfaceExternal, Sensitivity: "internal"},
			}),
		},
		{
			Name: "admin_secret_evidence_requires_audit",
			Decision: access.Require(access.Request{
				Principal: principalFromCaps("ce-admin", admin),
				ScopeType: access.ScopeOrg,
				ScopeID:   "ce-demo-org",
				Action:    access.ActionEvidenceRead,
				Resource:  access.Resource{Type: "evidence_pack", ID: "secret-demo", Surface: access.SurfaceExternal, Sensitivity: "secret"},
			}),
		},
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":    "flyto.engine-ce-access-self-test.v1",
		"decisions": tests,
	})
}

type moduleSummary struct {
	Key               string   `json:"key"`
	DisplayName       string   `json:"display_name"`
	TitleKey          string   `json:"title_key,omitempty"`
	Category          string   `json:"category"`
	RiskLevel         string   `json:"risk_level"`
	Status            string   `json:"status"`
	LandingPath       string   `json:"landing_path,omitempty"`
	SourceSelectable  bool     `json:"source_selectable"`
	FlytoNative       bool     `json:"flyto_native"`
	DefaultEnabled    bool     `json:"default_enabled"`
	CrossCutting      bool     `json:"cross_cutting,omitempty"`
	Billing           string   `json:"billing"`
	Features          []string `json:"features,omitempty"`
	GatingFeatures    []string `json:"gating_features,omitempty"`
	Permissions       []string `json:"permissions,omitempty"`
	CommercialActions []string `json:"commercial_actions,omitempty"`
	Pages             []string `json:"pages,omitempty"`
	CEValue           string   `json:"ce_value"`
	EnterpriseValue   string   `json:"enterprise_value"`
	UpgradeTrigger    string   `json:"upgrade_trigger"`
}

type accessDecisionSummary struct {
	Name     string          `json:"name"`
	Decision access.Decision `json:"decision"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Details string `json:"details,omitempty"`
}

func resolveCapabilitiesFromRequest(r *http.Request) (permission.Capabilities, error) {
	query := r.URL.Query()
	tier, err := parseTier(query.Get("tier"))
	if err != nil {
		return permission.Capabilities{}, err
	}
	plan, err := parsePlan(query.Get("plan"))
	if err != nil {
		return permission.Capabilities{}, err
	}
	role, err := parseRole(query.Get("role"))
	if err != nil {
		return permission.Capabilities{}, err
	}
	billingMode, err := parseBillingMode(query.Get("billing_mode"))
	if err != nil {
		return permission.Capabilities{}, err
	}
	return permission.ResolveWithBillingMode(tier, plan, role, csv(query.Get("features")), billingMode)
}

func parseTier(value string) (permission.Tier, error) {
	switch permission.Tier(defaultString(value, string(permission.TierCodeCTEMCSPM))) {
	case permission.TierCode, permission.TierCTEM, permission.TierCodeCTEM, permission.TierCodeCTEMCSPM:
		return permission.Tier(defaultString(value, string(permission.TierCodeCTEMCSPM))), nil
	default:
		return "", errors.New("tier must be code, ctem, code_ctem, or code_ctem_cspm")
	}
}

func parsePlan(value string) (permission.Plan, error) {
	switch permission.Plan(defaultString(value, string(permission.PlanFree))) {
	case permission.PlanFree, permission.PlanStarter, permission.PlanPro, permission.PlanTeam, permission.PlanEnterprise:
		return permission.Plan(defaultString(value, string(permission.PlanFree))), nil
	default:
		return "", errors.New("plan must be free, starter, pro, team, or enterprise")
	}
}

func parseRole(value string) (permission.Role, error) {
	switch permission.Role(defaultString(value, string(permission.RoleViewer))) {
	case permission.RoleOwner, permission.RoleAdmin, permission.RoleMember, permission.RoleViewer, permission.RoleGuest:
		return permission.Role(defaultString(value, string(permission.RoleViewer))), nil
	default:
		return "", errors.New("role must be owner, admin, member, viewer, or guest")
	}
}

func parseBillingMode(value string) (permission.BillingMode, error) {
	switch permission.BillingMode(defaultString(value, string(permission.BillingModeLive))) {
	case permission.BillingModeLive, permission.BillingModePreview:
		return permission.BillingMode(defaultString(value, string(permission.BillingModeLive))), nil
	default:
		return "", errors.New("billing_mode must be live or preview")
	}
}

func defaultString(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return fallback
	}
	return value
}

func csv(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	sort.Strings(out)
	return out
}

func principalFromCaps(userID string, caps permission.Capabilities) access.Principal {
	return access.Principal{
		UserID:      userID,
		Role:        string(caps.Role),
		Features:    caps.Features,
		Permissions: caps.Permissions,
	}
}

func normalizeCapabilities(caps *permission.Capabilities) {
	caps.Features = sortedCopy(caps.Features)
	caps.VisiblePages = sortedCopy(caps.VisiblePages)
	caps.Permissions = sortedCopy(caps.Permissions)
	caps.HiddenSurfaces = sortedCopy(caps.HiddenSurfaces)
	caps.UnsupportedActions = sortedCopy(caps.UnsupportedActions)
}

func sortedCopy(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := append([]string(nil), values...)
	sort.Strings(out)
	return out
}

func allowGET(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet {
		return true
	}
	w.Header().Set("Allow", http.MethodGet)
	writeJSON(w, http.StatusMethodNotAllowed, errorResponse{Error: "method_not_allowed"})
	return false
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
