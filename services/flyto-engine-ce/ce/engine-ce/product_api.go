package main

import (
	"context"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceauth"
	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/permission"
)

func newRuntimeHandler(ctx context.Context) (http.Handler, func(), error) {
	store, err := ceplatform.Open(ctx, os.Getenv("FLYTO_PG_URL"))
	if err != nil {
		return nil, nil, err
	}
	auth, err := ceauth.New(os.Getenv("FLYTO_LOCAL_AUTH_JWT_SECRET"), 12*time.Hour)
	if err != nil {
		store.Close()
		return nil, nil, err
	}
	srv := newCEServer(time.Now)
	srv.store, srv.auth = store, auth
	srv.bootstrapLimiter = newIPRateLimiter(5, time.Minute)
	srv.loginLimiter = newIPRateLimiter(10, time.Minute)
	return srv.handler(), store.Close, nil
}

type ipRateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]rateWindow
}
type rateWindow struct {
	start time.Time
	count int
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{limit: limit, window: window, entries: map[string]rateWindow{}}
}
func (l *ipRateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry := l.entries[key]
	if entry.start.IsZero() || now.Sub(entry.start) >= l.window {
		entry = rateWindow{start: now}
	}
	entry.count++
	l.entries[key] = entry
	return entry.count <= l.limit
}

func (s *ceServer) productReady(w http.ResponseWriter) bool {
	if s.store == nil || s.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResponse{Error: "ce_product_runtime_unavailable"})
		return false
	}
	return true
}

func (s *ceServer) handleLocalBootstrap(w http.ResponseWriter, r *http.Request) {
	if !s.productReady(w) {
		return
	}
	bootstrapEnabled := strings.TrimSpace(os.Getenv("FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP")) == "1"
	switch r.Method {
	case http.MethodGet:
		if !bootstrapEnabled {
			writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "required": false, "registrationOpen": false})
			return
		}
		open, err := s.store.BootstrapOpen(r.Context())
		if err != nil {
			writeAPIError(w, http.StatusServiceUnavailable, "bootstrap_status_unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "required": open, "registrationOpen": open})
	case http.MethodPost:
		if !bootstrapEnabled {
			writeAPIError(w, http.StatusForbidden, "bootstrap_disabled")
			return
		}
		if s.bootstrapLimiter != nil && !s.bootstrapLimiter.allow(remoteIP(r), s.now()) {
			writeAPIError(w, http.StatusTooManyRequests, "too_many_bootstrap_attempts")
			return
		}
		var req struct {
			Email       string `json:"email"`
			Password    string `json:"password"`
			DisplayName string `json:"displayName"`
		}
		if err := decodeRequestJSON(r, &req); err != nil {
			writeAPIError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		address, err := mail.ParseAddress(strings.TrimSpace(req.Email))
		if err != nil || !strings.Contains(address.Address, "@") {
			writeAPIError(w, http.StatusBadRequest, "valid_email_required")
			return
		}
		if len(strings.TrimSpace(req.DisplayName)) < 2 || len(req.DisplayName) > 100 {
			writeAPIError(w, http.StatusBadRequest, "display_name_invalid")
			return
		}
		hash, err := ceauth.HashPassword(req.Password)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, err.Error())
			return
		}
		user, project, err := s.store.Bootstrap(r.Context(), address.Address, req.DisplayName, hash)
		if errors.Is(err, ceplatform.ErrBootstrapClosed) {
			writeAPIError(w, http.StatusConflict, "registration_closed")
			return
		}
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "bootstrap_failed")
			return
		}
		s.writeSession(w, user, &project)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (s *ceServer) handleLocalLogin(w http.ResponseWriter, r *http.Request) {
	if !s.productReady(w) {
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if s.loginLimiter != nil && !s.loginLimiter.allow(remoteIP(r), s.now()) {
		writeAPIError(w, http.StatusTooManyRequests, "too_many_login_attempts")
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeRequestJSON(r, &req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	user, err := s.store.UserByEmail(r.Context(), req.Email)
	if err != nil || ceauth.CheckPassword(user.PasswordHash, req.Password) != nil {
		writeAPIError(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	s.writeSession(w, user, nil)
}

func (s *ceServer) writeSession(w http.ResponseWriter, user ceplatform.User, project *ceplatform.Project) {
	token, err := s.auth.Mint(user.ID, user.Email, user.DisplayName)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "token_issue_failed")
		return
	}
	payload := map[string]any{"accessToken": token, "access_token": token, "token_type": "Bearer", "expires_in": 43200, "user": user}
	if project != nil {
		payload["org"] = project
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *ceServer) requireUser(w http.ResponseWriter, r *http.Request) (ceplatform.User, bool) {
	if !s.productReady(w) {
		return ceplatform.User{}, false
	}
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		writeAPIError(w, http.StatusUnauthorized, "not_authenticated")
		return ceplatform.User{}, false
	}
	claims, err := s.auth.Verify(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
	if err != nil {
		writeAPIError(w, http.StatusUnauthorized, "not_authenticated")
		return ceplatform.User{}, false
	}
	user, err := s.store.UserByID(r.Context(), claims.Subject)
	if err != nil {
		writeAPIError(w, http.StatusUnauthorized, "not_authenticated")
		return ceplatform.User{}, false
	}
	return user, true
}

func (s *ceServer) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if r.URL.Path == "/api/v1/me" {
		writeJSON(w, http.StatusOK, user)
		return
	}
	if r.URL.Path == "/api/v1/me/capabilities" {
		s.handleMyCapabilities(w, r, user)
		return
	}
	writeAPIError(w, http.StatusNotFound, "not_found")
}

func (s *ceServer) handleOrgs(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		projects, err := s.store.ListProjects(r.Context(), user.ID)
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "projects_unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"organizations": projects, "count": len(projects)})
	case http.MethodPost:
		var req struct {
			Name        string `json:"name"`
			Slug        string `json:"slug"`
			ProjectType string `json:"project_type"`
		}
		if err := decodeRequestJSON(r, &req); err != nil || len(strings.TrimSpace(req.Name)) < 2 || !validSlug(req.Slug) {
			writeAPIError(w, http.StatusBadRequest, "name_and_slug_required")
			return
		}
		project, err := s.store.CreateProject(r.Context(), user.ID, req.Name, req.Slug, req.ProjectType)
		if errors.Is(err, ceplatform.ErrConflict) {
			writeAPIError(w, http.StatusConflict, "slug_already_exists")
			return
		}
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "project_create_failed")
			return
		}
		writeJSON(w, http.StatusCreated, project)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (s *ceServer) handleOrgRoutes(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	parts := pathParts(r.URL.Path)
	if len(parts) < 5 || parts[3] != "orgs" {
		writeAPIError(w, http.StatusNotFound, "not_found")
		return
	}
	projectID := parts[4]
	if len(parts) == 5 {
		switch r.Method {
		case http.MethodGet:
			project, err := s.store.Project(r.Context(), user.ID, projectID)
			writeStoreResult(w, project, err, http.StatusOK)
		case http.MethodPatch:
			current, err := s.store.Project(r.Context(), user.ID, projectID)
			if err != nil {
				writeStoreResult(w, current, err, http.StatusOK)
				return
			}
			var req struct {
				Name string `json:"name"`
				Slug string `json:"slug"`
			}
			if decodeRequestJSON(r, &req) != nil {
				writeAPIError(w, http.StatusBadRequest, "invalid_json")
				return
			}
			if req.Name == "" {
				req.Name = current.Name
			}
			if req.Slug == "" {
				req.Slug = current.Slug
			}
			updated, err := s.store.UpdateProject(r.Context(), user.ID, projectID, req.Name, req.Slug)
			writeStoreResult(w, updated, err, http.StatusOK)
		case http.MethodDelete:
			err := s.store.DeleteProject(r.Context(), user.ID, projectID)
			if err != nil {
				writeStoreError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		default:
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		}
		return
	}
	switch parts[5] {
	case "repos":
		s.handleProjectRepos(w, r, user, projectID)
	case "computed-score":
		if r.Method != http.MethodGet {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		s.handleComputedScore(w, r, user, projectID)
	case "health-summary":
		if r.Method != http.MethodGet {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		summary, err := s.store.HealthSummary(r.Context(), user.ID, projectID)
		writeStoreResult(w, summary, err, http.StatusOK)
	case "scan-log":
		if r.Method != http.MethodGet {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		rows, err := s.store.ScanLog(r.Context(), user.ID, projectID, parseLimit(r, 200))
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": rows, "count": len(rows)})
	case "reports":
		if len(parts) == 7 && parts[6] == "build" {
			s.handleBuildReport(w, r, user, projectID)
			return
		}
		writeAPIError(w, http.StatusNotFound, "not_found")
	default:
		writeAPIError(w, http.StatusNotFound, "not_found")
	}
}

func (s *ceServer) handleProjectRepos(w http.ResponseWriter, r *http.Request, user ceplatform.User, projectID string) {
	if len(pathParts(r.URL.Path)) != 6 {
		writeAPIError(w, http.StatusNotFound, "not_found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		repos, err := s.store.ListRepositories(r.Context(), user.ID, projectID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"repos": repos, "count": len(repos)})
	case http.MethodPost:
		var req struct {
			Provider      string `json:"provider"`
			ProviderID    string `json:"providerId"`
			OwnerName     string `json:"ownerName"`
			RepoName      string `json:"repoName"`
			FullName      string `json:"fullName"`
			DefaultBranch string `json:"defaultBranch"`
			Language      string `json:"language"`
			IsPrivate     bool   `json:"isPrivate"`
			HTMLURL       string `json:"htmlUrl"`
			CloneURL      string `json:"clone_url"`
		}
		if err := decodeRequestJSON(r, &req); err != nil {
			writeAPIError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		if req.IsPrivate {
			writeAPIError(w, http.StatusBadRequest, "private_repositories_require_local_upload")
			return
		}
		cloneURL := strings.TrimSpace(req.CloneURL)
		if cloneURL == "" {
			cloneURL = strings.TrimSpace(req.HTMLURL)
		}
		if req.FullName == "" {
			req.FullName = strings.Trim(strings.TrimPrefix(mustURLPath(cloneURL), "/"), "/")
			req.FullName = strings.TrimSuffix(req.FullName, ".git")
		}
		if req.RepoName == "" {
			chunks := strings.Split(req.FullName, "/")
			req.RepoName = chunks[len(chunks)-1]
		}
		if req.OwnerName == "" {
			chunks := strings.Split(req.FullName, "/")
			if len(chunks) > 1 {
				req.OwnerName = chunks[len(chunks)-2]
			}
		}
		repo, err := s.store.ConnectRepository(r.Context(), user.ID, projectID, ceplatform.Repository{Provider: req.Provider, ProviderID: req.ProviderID, OwnerName: req.OwnerName, RepoName: req.RepoName, FullName: req.FullName, DefaultBranch: req.DefaultBranch, Language: req.Language, IsPrivate: false, HTMLURL: req.HTMLURL, CloneURL: cloneURL, ScanMode: "cloud"})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		_, _ = s.store.CreateScan(r.Context(), user.ID, repo.ID)
		writeJSON(w, http.StatusCreated, repo)
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (s *ceServer) handleRepoRoutes(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	parts := pathParts(r.URL.Path)
	if len(parts) < 5 || parts[3] != "repos" {
		writeAPIError(w, http.StatusNotFound, "not_found")
		return
	}
	repoID := parts[4]
	if len(parts) == 5 {
		if r.Method != http.MethodDelete {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		if err := s.store.DeleteRepository(r.Context(), user.ID, repoID); err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}
	switch parts[5] {
	case "scans":
		if r.Method == http.MethodPost {
			scan, err := s.store.CreateScan(r.Context(), user.ID, repoID)
			writeStoreResult(w, scan, err, http.StatusCreated)
			return
		}
		if r.Method == http.MethodGet {
			scans, err := s.store.ListRepoScans(r.Context(), user.ID, repoID, parseLimit(r, 20))
			if err != nil {
				writeStoreError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"scans": scans, "count": len(scans)})
			return
		}
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	case "findings":
		if r.Method != http.MethodGet {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		findings, err := s.store.RepoFindings(r.Context(), user.ID, repoID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, groupFindings(findings))
	case "health":
		if r.Method != http.MethodGet {
			writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		repo, err := s.store.Repository(r.Context(), user.ID, repoID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		findings, err := s.store.RepoFindings(r.Context(), user.ID, repoID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, buildRepoProfile(repo, findings))
	default:
		writeAPIError(w, http.StatusNotFound, "not_found")
	}
}

func buildRepoProfile(repo ceplatform.Repository, findings []ceplatform.Finding) map[string]any {
	secretCount, sastCount, dependencyCount := 0, 0, 0
	sastFindings := make([]map[string]any, 0, len(findings))
	for _, finding := range findings {
		switch finding.Category {
		case "secret":
			secretCount++
		case "dependency":
			dependencyCount++
		default:
			sastCount++
		}
		sastFindings = append(sastFindings, map[string]any{"title": finding.Name, "severity": finding.Severity, "file": finding.File, "line": finding.Line, "rule": finding.RuleID})
	}
	display, grade := localCEScore(findings)
	return map[string]any{
		"health_dimensions": map[string]any{
			"security": map[string]any{"score": display, "max_score": 900, "grade": grade, "issues": len(findings)},
			"overall":  map[string]any{"score": display, "max_score": 900, "grade": grade},
		},
		"languages":            map[string]int{repo.Language: 1},
		"symbol_counts":        map[string]int{},
		"api_definition_count": 0,
		"model_count":          0,
		"dependency_count":     dependencyCount,
		"conflict_count":       0,
		"secret_count":         secretCount,
		"taint_flow_count":     0,
		"complex_functions":    0,
		"avg_complexity":       0,
		"dead_code_count":      0,
		"doc_score":            0,
		"project_license":      "",
		"patterns":             []string{},
		"connection_count":     0,
		"orphan_count":         0,
		"cve_critical":         0,
		"cve_high":             0,
		"cve_total":            dependencyCount,
		"sast_findings":        sastFindings,
		"summary":              strconv.Itoa(secretCount+sastCount+dependencyCount) + " local CE finding(s)",
		"scanId":               "",
		"scannedAt":            repo.LastScannedAt,
	}
}

func (s *ceServer) handleComputedScore(w http.ResponseWriter, r *http.Request, user ceplatform.User, projectID string) {
	summary, err := s.store.HealthSummary(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	repos, err := s.store.ListRepositories(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	names := make(map[string]string, len(repos))
	for _, repo := range repos {
		names[repo.ID] = repo.FullName
	}
	repoScores := make([]map[string]any, 0, len(summary.Repos))
	for _, row := range summary.Repos {
		if row.ScannedAt == nil {
			continue
		}
		raw := (float64(row.DisplayScore) - 250) / 6.5
		if raw < 0 {
			raw = 0
		}
		if raw > 100 {
			raw = 100
		}
		repoScores = append(repoScores, map[string]any{"repo_id": row.RepoID, "name": names[row.RepoID], "raw": raw, "display": row.DisplayScore, "grade": row.Grade, "scorable": true})
	}
	available := len(repoScores) > 0
	overallDisplay := summary.Aggregated.AvgScore
	var overallRaw any
	var overallGrade any
	if available {
		overallRaw = (float64(overallDisplay) - 250) / 6.5
		overallGrade = summary.Aggregated.AvgGrade
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"score_available": available,
		"message":         map[bool]string{true: "", false: "Run the first local CE scan to compute posture."}[available],
		"no_score_reason": map[bool]any{true: nil, false: "bootstrap"}[available],
		"categories":      []any{},
		"overall_raw":     overallRaw,
		"overall_display": func() any {
			if available {
				return overallDisplay
			}
			return nil
		}(),
		"overall_grade":       overallGrade,
		"overall_grade_color": gradeColor(summary.Aggregated.AvgGrade),
		"active_count":        summary.Aggregated.CriticalCount + summary.Aggregated.HighCount,
		"total_count":         len(repoScores),
		"cross_dim":           map[string]float64{"blast_radius_penalty": 0, "pr_adjacency_penalty": 0, "taint_adjacency_penalty": 0, "pentest_verdict_modifier": 0, "autofix_coverage_bonus": 0, "total": 0},
		"mode":                "internal",
		"repo_scores":         repoScores,
	})
}

func localCEScore(findings []ceplatform.Finding) (int, string) {
	score := 900
	for _, finding := range findings {
		switch finding.Severity {
		case "critical":
			score -= 100
		case "high":
			score -= 55
		case "medium":
			score -= 25
		default:
			score -= 8
		}
	}
	if score < 250 {
		score = 250
	}
	grade := "F"
	switch {
	case score >= 800:
		grade = "A"
	case score >= 700:
		grade = "B"
	case score >= 600:
		grade = "C"
	case score >= 500:
		grade = "D"
	}
	return score, grade
}

func gradeColor(grade string) string {
	return map[string]string{"A": "#16a34a", "B": "#65a30d", "C": "#ca8a04", "D": "#ea580c", "F": "#dc2626"}[grade]
}

func groupFindings(findings []ceplatform.Finding) map[string]any {
	groups := map[string][]ceplatform.Finding{"dead_code": {}, "complex_functions": {}, "sast_findings": {}, "secrets": {}, "taint_flows": {}}
	for _, finding := range findings {
		switch finding.Category {
		case "secret":
			groups["secrets"] = append(groups["secrets"], finding)
		case "sast":
			groups["sast_findings"] = append(groups["sast_findings"], finding)
		default:
			groups["sast_findings"] = append(groups["sast_findings"], finding)
		}
	}
	return map[string]any{"dead_code": groups["dead_code"], "complex_functions": groups["complex_functions"], "sast_findings": groups["sast_findings"], "secrets": groups["secrets"], "taint_flows": groups["taint_flows"], "dead_code_count": 0, "complex_count": 0, "sast_count": len(groups["sast_findings"]), "secret_count": len(groups["secrets"]), "taint_count": 0}
}

func (s *ceServer) handleBuildReport(w http.ResponseWriter, r *http.Request, user ceplatform.User, projectID string) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	project, err := s.store.Project(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	findings, err := s.store.ProjectFindings(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	summary, err := s.store.HealthSummary(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	severity := map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0}
	for _, finding := range findings {
		severity[finding.Severity]++
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", `inline; filename="flyto-warroom-ce-report.html"`)
	w.WriteHeader(http.StatusOK)
	_ = ceReportTemplate.Execute(w, map[string]any{"Project": project, "GeneratedAt": s.now().UTC().Format(time.RFC3339), "Findings": findings, "Severity": severity, "Summary": summary})
}

var ceReportTemplate = template.Must(template.New("report").Parse(`<!doctype html><html><head><meta charset="utf-8"><title>Flyto2 Warroom CE Security Report</title><style>body{font:15px system-ui;max-width:1050px;margin:40px auto;padding:0 24px;color:#172033}h1,h2{color:#111827}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{padding:16px;border:1px solid #dbe2ea;border-radius:10px}.critical{color:#b91c1c}.high{color:#c2410c}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:9px;vertical-align:top}code{font-size:12px}</style></head><body><h1>Flyto2 Warroom CE Security Report</h1><p><strong>{{.Project.Name}}</strong> · generated {{.GeneratedAt}} · locally computed, non-comparable CE evidence</p><div class="metrics"><div class="metric critical"><strong>{{index .Severity "critical"}}</strong><br>Critical</div><div class="metric high"><strong>{{index .Severity "high"}}</strong><br>High</div><div class="metric"><strong>{{index .Severity "medium"}}</strong><br>Medium</div><div class="metric"><strong>{{len .Findings}}</strong><br>Total findings</div></div><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Finding</th><th>Location</th><th>Remediation</th></tr></thead><tbody>{{range .Findings}}<tr><td>{{.Severity}}</td><td>{{.Name}}<br><code>{{.RuleID}}</code></td><td><code>{{.File}}:{{.Line}}</code></td><td>{{.Detail}}</td></tr>{{else}}<tr><td colspan="4">No findings in the latest scans.</td></tr>{{end}}</tbody></table></body></html>`))

func decodeRequestJSON(r *http.Request, value any) error {
	defer r.Body.Close()
	const maxRequestBytes = 1 << 20
	limited := io.LimitReader(r.Body, maxRequestBytes+1)
	decoder := json.NewDecoder(limited)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("request body must contain one JSON value")
	}
	return nil
}
func pathParts(path string) []string { return strings.Split(strings.Trim(path, "/"), "/") }
func remoteIP(r *http.Request) string {
	value := r.RemoteAddr
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		value = strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	return strings.Trim(value, "[]")
}
func validSlug(slug string) bool {
	slug = strings.TrimSpace(slug)
	if len(slug) < 2 || len(slug) > 64 {
		return false
	}
	for _, r := range slug {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return false
		}
	}
	return true
}
func parseLimit(r *http.Request, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}
func mustURLPath(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Path
}
func writeAPIError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": message, "message": message}})
}
func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ceplatform.ErrNotFound):
		writeAPIError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, ceplatform.ErrConflict):
		writeAPIError(w, http.StatusConflict, "conflict")
	case errors.Is(err, ceplatform.ErrInvalidInput):
		writeAPIError(w, http.StatusBadRequest, "invalid_input")
	default:
		writeAPIError(w, http.StatusInternalServerError, "internal_error")
	}
}
func writeStoreResult(w http.ResponseWriter, value any, err error, status int) {
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, status, value)
}

func (s *ceServer) handleMyCapabilities(w http.ResponseWriter, r *http.Request, user ceplatform.User) {
	projectID := r.URL.Query().Get("org_id")
	project, err := s.store.Project(r.Context(), user.ID, projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	caps, err := permission.ResolveWithProjectType(permission.TierCodeCTEMCSPM, permission.PlanEnterprise, permission.RoleOwner, nil, permission.ProjectType(project.ProjectType), nil)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "capability_resolution_failed")
		return
	}
	caps = permission.ApplyCurrentEditionProfile(caps)
	normalizeCapabilities(&caps)
	writeJSON(w, http.StatusOK, caps)
}
