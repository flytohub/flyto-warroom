package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/flytohub/flyto-engine/internal/backoff"
	"github.com/flytohub/flyto-engine/internal/canary"
	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/circuit"
	"github.com/flytohub/flyto-engine/internal/obs"
	"github.com/flytohub/flyto-engine/internal/scanqueue"
	"github.com/flytohub/flyto-engine/internal/scheduler"
)

const (
	productName = "Flyto2 Warroom CE"
	serviceName = "worker-ce-source-runtime"
	sourceMode  = "complete_ce_worker_source_runtime"
)

type workerServer struct {
	startedAt time.Time
	now       func() time.Time
	queue     *scanqueue.Queue
	processed chan scanqueue.ScanJob
	store     *ceplatform.Store
}

func newHandler() http.Handler {
	return newWorkerServer(time.Now).handler()
}

func newWorkerServer(now func() time.Time) *workerServer {
	if now == nil {
		now = time.Now
	}
	processed := make(chan scanqueue.ScanJob, 16)
	q := scanqueue.New(1, func(job scanqueue.ScanJob) {
		processed <- job
	})
	return &workerServer{
		startedAt: now().UTC(),
		now:       now,
		queue:     q,
		processed: processed,
	}
}

func (s *workerServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/readyz", s.handleReady)
	mux.HandleFunc("/api/v1/ce/worker/boundary", s.handleBoundary)
	mux.HandleFunc("/api/v1/ce/worker/self-test", s.handleSelfTest)
	return requestContextMiddleware(mux)
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

func (s *workerServer) handleIndex(w http.ResponseWriter, r *http.Request) {
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
			{"rel": "boundary", "href": "/api/v1/ce/worker/boundary"},
			{"rel": "self_test", "href": "/api/v1/ce/worker/self-test"},
		},
	})
}

func (s *workerServer) handleHealth(w http.ResponseWriter, r *http.Request) {
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

func (s *workerServer) handleReady(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
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
		"status":  "ready",
		"product": productName,
		"service": serviceName,
		"edition": "community",
		"primitives": []string{
			"durable PostgreSQL scan dispatch",
			"credential-free public Git clone",
			"native secrets, IaC, SAST, and dependency scanning",
			"bounded scan queue",
			"stable scheduler buckets",
			"adaptive backoff",
			"circuit breaker",
			"scanner canary regression bookkeeping",
		},
	})
}

func (s *workerServer) handleBoundary(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":                "flyto.worker-ce-runtime-boundary.v1",
		"product":               productName,
		"service":               serviceName,
		"edition":               "community",
		"source_mode":           sourceMode,
		"source_path":           "ce/worker-ce",
		"public_package":        "services/flyto-engine-ce",
		"public_runtime_routes": []string{"/healthz", "/readyz", "/api/v1/ce/worker/boundary", "/api/v1/ce/worker/self-test"},
		"private_boundaries": []string{
			"runner callback authentication and hosted execution plane",
			"commercial cloud, container, runtime, and AutoFix adapters",
			"proprietary threat intelligence and customer connector credentials",
			"enterprise evidence retention, legal hold, and airgap packaging internals",
		},
		"composition_contracts": []string{
			"capability snapshot",
			"scan registry contract",
			"runner callback contract",
			"event/evidence contract",
			"scheduler run ledger contract",
		},
	})
}

func (s *workerServer) handleSelfTest(w http.ResponseWriter, r *http.Request) {
	if !allowGET(w, r) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()

	queueProbe := s.runQueueProbe(ctx)
	schedulerProbe := runSchedulerProbe(s.now())
	backoffProbe := runBackoffProbe()
	circuitProbe := runCircuitProbe()
	canaryProbe := runCanaryProbe(ctx)
	status := "pass"
	if !queueProbe.OK || !schedulerProbe.OK || !backoffProbe.OK || !circuitProbe.OK || !canaryProbe.OK {
		status = "fail"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":    "flyto.worker-ce-self-test.v1",
		"status":    status,
		"queue":     queueProbe,
		"scheduler": schedulerProbe,
		"backoff":   backoffProbe,
		"circuit":   circuitProbe,
		"canary":    canaryProbe,
	})
}

type queueProbe struct {
	OK     bool   `json:"ok"`
	ScanID string `json:"scan_id,omitempty"`
	RepoID string `json:"repo_id,omitempty"`
	OrgID  string `json:"org_id,omitempty"`
	Error  string `json:"error,omitempty"`
}

func (s *workerServer) runQueueProbe(ctx context.Context) queueProbe {
	for {
		select {
		case <-s.processed:
			continue
		default:
		}
		break
	}
	job := scanqueue.ScanJob{
		ScanID:  "ce-worker-self-test",
		RepoID:  "repo-demo",
		OrgID:   "org-demo",
		HTMLURL: "https://example.invalid/flyto2/warroom",
		Token:   "redacted",
	}
	s.queue.Enqueue(job)

	select {
	case got := <-s.processed:
		return queueProbe{OK: got.ScanID == job.ScanID && got.Token == "redacted", ScanID: got.ScanID, RepoID: got.RepoID, OrgID: got.OrgID}
	case <-ctx.Done():
		return queueProbe{OK: false, Error: ctx.Err().Error()}
	}
}

type schedulerProbe struct {
	OK          bool     `json:"ok"`
	Buckets     int      `json:"buckets"`
	DueOrgIDs   []string `json:"due_org_ids"`
	CoverageOK  bool     `json:"coverage_ok"`
	SpreadCheck string   `json:"spread_check"`
}

func runSchedulerProbe(now time.Time) schedulerProbe {
	orgs := []string{"org-alpha", "org-beta", "org-gamma", "org-delta"}
	due := scheduler.FilterDueOrgs(orgs, 24, now)
	seen := map[string]int{}
	base := now.UTC().Truncate(24 * time.Hour)
	for h := 0; h < 24; h++ {
		for _, orgID := range scheduler.FilterDueOrgs(orgs, 24, base.Add(time.Duration(h)*time.Hour)) {
			seen[orgID]++
		}
	}
	coverageOK := len(seen) == len(orgs)
	for _, orgID := range orgs {
		if seen[orgID] != 1 {
			coverageOK = false
			break
		}
	}
	return schedulerProbe{
		OK:          coverageOK,
		Buckets:     24,
		DueOrgIDs:   due,
		CoverageOK:  coverageOK,
		SpreadCheck: "each demo org is due exactly once per UTC day",
	}
}

type backoffProbe struct {
	OK        bool     `json:"ok"`
	Intervals []string `json:"intervals"`
	Failures  int      `json:"failures_after_reset"`
}

func runBackoffProbe() backoffProbe {
	controller := backoff.New(10*time.Second, 80*time.Second)
	intervals := []time.Duration{controller.NextInterval()}
	controller.Failure()
	intervals = append(intervals, controller.NextInterval())
	controller.Failure()
	intervals = append(intervals, controller.NextInterval())
	controller.Success()
	reset := controller.NextInterval()
	intervals = append(intervals, reset)
	encoded := make([]string, 0, len(intervals))
	for _, interval := range intervals {
		encoded = append(encoded, interval.String())
	}
	return backoffProbe{
		OK:        encoded[0] == "10s" && encoded[1] == "20s" && encoded[2] == "40s" && encoded[3] == "10s",
		Intervals: encoded,
		Failures:  controller.Failures(),
	}
}

type circuitProbe struct {
	OK            bool     `json:"ok"`
	States        []string `json:"states"`
	FailFastError bool     `json:"fail_fast_error"`
}

func runCircuitProbe() circuitProbe {
	now := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	cfg := circuit.DefaultConfig("ce-worker-probe")
	cfg.FailureThreshold = 2
	cfg.CooldownPeriod = time.Second
	cfg.Now = func() time.Time { return now }
	breaker := circuit.New(cfg)
	states := []string{breaker.State().String()}
	breaker.RecordFailure()
	breaker.RecordFailure()
	states = append(states, breaker.State().String())
	failFast := breaker.Allow() != nil
	now = now.Add(2 * time.Second)
	halfOpenAllowed := breaker.Allow() == nil
	states = append(states, breaker.State().String())
	breaker.RecordSuccess()
	states = append(states, breaker.State().String())
	ok := failFast && halfOpenAllowed && states[0] == "closed" && states[1] == "open" && states[2] == "half-open" && states[3] == "closed"
	return circuitProbe{OK: ok, States: states, FailFastError: failFast}
}

type canaryProbe struct {
	OK        bool     `json:"ok"`
	Results   []string `json:"results"`
	Regressed []string `json:"regressed"`
	Alerts    []string `json:"alerts"`
}

func runCanaryProbe(ctx context.Context) canaryProbe {
	checks := []canary.CanaryCheck{
		{Name: "ce-pass", Domain: "pass.example.invalid", ScannerKind: "ce-deterministic-pass", ExpectedVerdict: "pass"},
		{Name: "ce-regression", Domain: "regression.example.invalid", ScannerKind: "ce-deterministic-fail", ExpectedVerdict: "pass"},
	}
	runners := map[string]canary.ScannerFunc{
		"ce-deterministic-pass": func(context.Context, string) (string, string, error) {
			return "pass", "deterministic CE canary pass", nil
		},
		"ce-deterministic-fail": func(context.Context, string) (string, string, error) {
			return "fail", "deterministic CE canary mismatch", nil
		},
	}
	store := newMemoryRegressionStore()
	results := canary.RunOnce(ctx, checks, runners)
	alerts := []string{}
	regressed := canary.HandleResults(ctx, results, store, func(scanner, reason string) {
		alerts = append(alerts, scanner+": "+reason)
	})
	summaries := make([]string, 0, len(results))
	for _, result := range results {
		summaries = append(summaries, result.Check.Name+"="+result.Observed)
	}
	ok := len(regressed) == 1 && regressed[0] == "ce-deterministic-fail" && len(alerts) == 1
	return canaryProbe{OK: ok, Results: summaries, Regressed: regressed, Alerts: alerts}
}

type memoryRegressionStore struct {
	mu    sync.Mutex
	items map[string]regressionRecord
}

type regressionRecord struct {
	reason string
	until  time.Time
}

func newMemoryRegressionStore() *memoryRegressionStore {
	return &memoryRegressionStore{items: map[string]regressionRecord{}}
}

func (s *memoryRegressionStore) MarkRegressed(_ context.Context, scanner string, reason string, until time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[scanner] = regressionRecord{reason: reason, until: until}
	return nil
}

func (s *memoryRegressionStore) IsRegressed(_ context.Context, scanner string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.items[scanner]
	return ok, nil
}

func (s *memoryRegressionStore) Clear(_ context.Context, scanner string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, scanner)
	return nil
}

type errorResponse struct {
	Error   string `json:"error"`
	Details string `json:"details,omitempty"`
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
