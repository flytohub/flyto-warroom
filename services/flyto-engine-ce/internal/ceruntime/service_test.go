package ceruntime

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHandlerPublishesHealthReadinessAndBoundary(t *testing.T) {
	state := &State{startedAt: time.Date(2026, 7, 23, 12, 0, 0, 0, time.UTC)}
	config := Config{
		Name:        "analysis-ce",
		SourcePath:  "ce/analysis-ce",
		Description: "Builds transparent local evidence.",
		Ready:       func(context.Context) error { return nil },
	}
	handler := Handler(config, state)

	for _, path := range []string{"/healthz", "/readyz"} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, recorder.Code)
		}
		var payload map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		if payload["service"] != "analysis-ce" || payload["edition"] != "community" {
			t.Fatalf("%s payload = %#v", path, payload)
		}
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/api/v1/ce/service/boundary", nil),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("boundary status = %d, want 200", recorder.Code)
	}
	var boundary map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &boundary); err != nil {
		t.Fatal(err)
	}
	if boundary["schema"] != "flyto.ce-microservice-boundary.v1" {
		t.Fatalf("boundary schema = %#v", boundary["schema"])
	}
	if boundary["source_path"] != "ce/analysis-ce" {
		t.Fatalf("boundary source path = %#v", boundary["source_path"])
	}
	if boundary["live_actions"] != false {
		t.Fatalf("boundary must deny live actions: %#v", boundary)
	}
}

func TestHandlerFailsReadinessClosedAndRejectsMutationMethods(t *testing.T) {
	handler := Handler(Config{
		Name:       "report-ce",
		SourcePath: "ce/report-ce",
		Ready: func(context.Context) error {
			return errors.New("database unavailable")
		},
	}, &State{startedAt: time.Now().UTC()})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("ready status = %d, want 503", recorder.Code)
	}
	if recorder.Body.String() == "" {
		t.Fatal("readiness failure must return a JSON body")
	}

	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/healthz", nil))
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST health status = %d, want 405", recorder.Code)
	}
	if recorder.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("Allow = %q, want GET", recorder.Header().Get("Allow"))
	}
}

func TestStateRecordsOnlySuccessfulProcessedWork(t *testing.T) {
	state := &State{startedAt: time.Now().UTC()}
	state.record(TickResult{Processed: 3}, nil)
	state.record(TickResult{Processed: 9}, errors.New("failed"))

	snapshot := state.snapshot(Config{Name: "scheduler-ce"}, "ok")
	if snapshot["processed"] != 3 {
		t.Fatalf("processed = %#v, want 3", snapshot["processed"])
	}
	if snapshot["last_error"] != "failed" {
		t.Fatalf("last_error = %#v, want failed", snapshot["last_error"])
	}
	if snapshot["last_success_at"] == nil || snapshot["last_tick_at"] == nil {
		t.Fatalf("timestamps not recorded: %#v", snapshot)
	}
}
