// Package ceruntime provides the small shared HTTP and lifecycle shell used by
// independently deployable Community Edition background services.
package ceruntime

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"
)

type TickResult struct {
	Processed int `json:"processed"`
}

type Config struct {
	Name        string
	SourcePath  string
	Addr        string
	Interval    time.Duration
	Description string
	Ready       func(context.Context) error
	Tick        func(context.Context) (TickResult, error)
}

type State struct {
	mu            sync.RWMutex
	startedAt     time.Time
	lastTickAt    *time.Time
	lastSuccessAt *time.Time
	lastError     string
	processed     int
}

func Run(ctx context.Context, config Config) error {
	if config.Name == "" || config.SourcePath == "" || config.Ready == nil || config.Tick == nil {
		return errors.New("CE service name, source path, ready check, and tick are required")
	}
	if config.Addr == "" {
		return errors.New("CE service address is required")
	}
	if config.Interval < 100*time.Millisecond {
		config.Interval = time.Second
	}
	state := &State{startedAt: time.Now().UTC()}
	server := &http.Server{
		Addr:              config.Addr,
		Handler:           Handler(config, state),
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
			return
		}
		serverErrors <- nil
	}()

	ticker := time.NewTicker(config.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			return server.Shutdown(shutdownCtx)
		case err := <-serverErrors:
			return err
		case <-ticker.C:
			tickCtx, cancel := context.WithTimeout(ctx, config.Interval)
			result, err := config.Tick(tickCtx)
			cancel()
			state.record(result, err)
		}
	}
}

func Handler(config Config, state *State) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
			return
		}
		writeJSON(w, http.StatusOK, state.snapshot(config, "ok"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
			return
		}
		readyCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := config.Ready(readyCtx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"status":  "not_ready",
				"service": config.Name,
				"error":   "postgres_unavailable",
			})
			return
		}
		writeJSON(w, http.StatusOK, state.snapshot(config, "ready"))
	})
	mux.HandleFunc("/api/v1/ce/service/boundary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       "flyto.ce-microservice-boundary.v1",
			"product":      "Flyto2 Warroom CE",
			"service":      config.Name,
			"edition":      "community",
			"source_path":  config.SourcePath,
			"description":  config.Description,
			"data_mode":    "local_postgresql",
			"authority":    "local_non_comparable",
			"live_actions": false,
			"private_boundaries": []string{
				"commercial provider credentials and managed execution",
				"proprietary correlation datasets and rating authority",
				"live remediation and paid approval orchestration",
				"SaaS and Enterprise control-plane implementation",
			},
		})
	})
	return mux
}

func (state *State) record(result TickResult, err error) {
	state.mu.Lock()
	defer state.mu.Unlock()
	now := time.Now().UTC()
	state.lastTickAt = &now
	if err != nil {
		state.lastError = err.Error()
		return
	}
	state.lastError = ""
	state.lastSuccessAt = &now
	state.processed += result.Processed
}

func (state *State) snapshot(config Config, status string) map[string]any {
	state.mu.RLock()
	defer state.mu.RUnlock()
	return map[string]any{
		"status":          status,
		"product":         "Flyto2 Warroom CE",
		"service":         config.Name,
		"edition":         "community",
		"started_at":      state.startedAt,
		"last_tick_at":    state.lastTickAt,
		"last_success_at": state.lastSuccessAt,
		"last_error":      state.lastError,
		"processed":       state.processed,
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
