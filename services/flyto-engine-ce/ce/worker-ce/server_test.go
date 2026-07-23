package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthIncludesWorkerRuntimeBoundary(t *testing.T) {
	handler := newWorkerServer(func() time.Time {
		return time.Date(2026, 7, 15, 1, 2, 3, 0, time.UTC)
	}).handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "req-worker-test")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("X-Request-ID"); got != "req-worker-test" {
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

func TestBoundaryPublishesCompleteCEScanWorker(t *testing.T) {
	rec := getJSON("/api/v1/ce/worker/boundary")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		SourcePath        string   `json:"source_path"`
		SourceMode        string   `json:"source_mode"`
		PrivateBoundaries []string `json:"private_boundaries"`
	}
	decodeJSON(t, rec, &body)
	if body.SourcePath != "ce/worker-ce" {
		t.Fatalf("source_path = %q", body.SourcePath)
	}
	if body.SourceMode != "complete_ce_worker_source_runtime" {
		t.Fatalf("source_mode = %q", body.SourceMode)
	}
	if len(body.PrivateBoundaries) < 4 {
		t.Fatalf("expected private boundaries, got %#v", body.PrivateBoundaries)
	}
}

func TestSelfTestExercisesWorkerPrimitives(t *testing.T) {
	rec := getJSON("/api/v1/ce/worker/self-test")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Status string `json:"status"`
		Queue  struct {
			OK     bool   `json:"ok"`
			ScanID string `json:"scan_id"`
		} `json:"queue"`
		Scheduler struct {
			OK         bool `json:"ok"`
			CoverageOK bool `json:"coverage_ok"`
		} `json:"scheduler"`
		Backoff struct {
			OK        bool     `json:"ok"`
			Intervals []string `json:"intervals"`
		} `json:"backoff"`
		Circuit struct {
			OK            bool     `json:"ok"`
			States        []string `json:"states"`
			FailFastError bool     `json:"fail_fast_error"`
		} `json:"circuit"`
		Canary struct {
			OK        bool     `json:"ok"`
			Regressed []string `json:"regressed"`
		} `json:"canary"`
	}
	decodeJSON(t, rec, &body)
	if body.Status != "pass" {
		t.Fatalf("self-test status = %q; body=%s", body.Status, rec.Body.String())
	}
	if !body.Queue.OK || body.Queue.ScanID != "ce-worker-self-test" {
		t.Fatalf("queue probe failed: %#v", body.Queue)
	}
	if !body.Scheduler.OK || !body.Scheduler.CoverageOK {
		t.Fatalf("scheduler probe failed: %#v", body.Scheduler)
	}
	if !body.Backoff.OK || len(body.Backoff.Intervals) != 4 {
		t.Fatalf("backoff probe failed: %#v", body.Backoff)
	}
	if !body.Circuit.OK || !body.Circuit.FailFastError || len(body.Circuit.States) != 4 {
		t.Fatalf("circuit probe failed: %#v", body.Circuit)
	}
	if !body.Canary.OK || len(body.Canary.Regressed) != 1 || body.Canary.Regressed[0] != "ce-deterministic-fail" {
		t.Fatalf("canary probe failed: %#v", body.Canary)
	}
}

func TestMethodsAreFailClosed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ce/worker/self-test", nil)
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
