package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/ceruntime"
	"github.com/flytohub/flyto-engine/internal/ceworkflow"
	"github.com/flytohub/flyto-engine/internal/obs"
)

func main() {
	obs.SetDefault(obs.NewJSONLogger(os.Stdout, slog.LevelInfo))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := ceplatform.Open(ctx, os.Getenv("FLYTO_PG_URL"))
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE report initialization failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	err = ceruntime.Run(ctx, ceruntime.Config{
		Name:        "report-ce",
		SourcePath:  "ce/report-ce",
		Addr:        addressEnv("FLYTO_CE_REPORT_ADDR", ":8084"),
		Interval:    durationEnv("FLYTO_CE_REPORT_TICK", 3*time.Second),
		Description: "Renders portable local HTML evidence reports from completed Community Edition analysis.",
		Ready:       store.Ping,
		Tick: func(tickCtx context.Context) (ceruntime.TickResult, error) {
			work, claimed, tickErr := store.ClaimReport(tickCtx)
			if tickErr != nil || !claimed {
				return ceruntime.TickResult{}, tickErr
			}
			body, tickErr := ceworkflow.RenderReport(work, time.Now())
			if tickErr == nil {
				tickErr = store.CompleteReport(tickCtx, work, body)
			}
			if tickErr != nil {
				_ = store.FailReport(tickCtx, work.Scan.ID, tickErr)
				return ceruntime.TickResult{}, tickErr
			}
			return ceruntime.TickResult{Processed: 1}, nil
		},
	})
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE report stopped", "error", err)
		os.Exit(1)
	}
}

func addressEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	if strings.Contains(value, ":") {
		return value
	}
	return ":" + value
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		return fallback
	}
	return duration
}
