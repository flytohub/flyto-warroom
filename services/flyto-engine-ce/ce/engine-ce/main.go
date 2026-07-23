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
	ensureCEEnvironment()
	obs.SetDefault(obs.NewJSONLogger(os.Stdout, slog.LevelInfo))
	handler, closeRuntime, err := newRuntimeHandler(context.Background())
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE runtime initialization failed", "error", err)
		os.Exit(1)
	}
	defer closeRuntime()

	addr := listenAddr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	obs.Default().Info("starting Flyto2 Warroom CE engine runtime", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		obs.Default().Error("Flyto2 Warroom CE engine runtime stopped", "error", err)
		os.Exit(1)
	}
}

func listenAddr() string {
	if value := strings.TrimSpace(os.Getenv("FLYTO_CE_ADDR")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("PORT")); value != "" {
		if strings.Contains(value, ":") {
			return value
		}
		return ":" + value
	}
	return ":8080"
}
