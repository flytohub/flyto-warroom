package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/obs"
)

func main() {
	obs.SetDefault(obs.NewJSONLogger(os.Stdout, slog.LevelInfo))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	worker, closeRuntime, err := newRuntimeWorker(ctx)
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE worker initialization failed", "error", err)
		os.Exit(1)
	}
	defer closeRuntime()
	go worker.runScanLoop(ctx)

	addr := listenAddr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           worker.handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	obs.Default().Info("starting Flyto2 Warroom CE worker runtime", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		obs.Default().Error("Flyto2 Warroom CE worker runtime stopped", "error", err)
		os.Exit(1)
	}
}

func listenAddr() string {
	if value := strings.TrimSpace(os.Getenv("FLYTO_CE_WORKER_ADDR")); value != "" {
		return normalizeAddr(value)
	}
	if value := strings.TrimSpace(os.Getenv("FLYTO_CE_ADDR")); value != "" {
		return normalizeAddr(value)
	}
	if value := strings.TrimSpace(os.Getenv("PORT")); value != "" {
		return normalizeAddr(value)
	}
	return ":8081"
}

func normalizeAddr(value string) string {
	if strings.Contains(value, ":") {
		return value
	}
	return ":" + value
}
