package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/ceruntime"
	"github.com/flytohub/flyto-engine/internal/obs"
)

func main() {
	obs.SetDefault(obs.NewJSONLogger(os.Stdout, slog.LevelInfo))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := ceplatform.Open(ctx, os.Getenv("FLYTO_PG_URL"))
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE scheduler initialization failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	scanInterval := durationEnv("FLYTO_CE_SCAN_INTERVAL", 24*time.Hour)
	err = ceruntime.Run(ctx, ceruntime.Config{
		Name:        "scheduler-ce",
		SourcePath:  "ce/scheduler-ce",
		Addr:        addressEnv("FLYTO_CE_SCHEDULER_ADDR", ":8082"),
		Interval:    durationEnv("FLYTO_CE_SCHEDULER_TICK", 30*time.Second),
		Description: "Schedules provider-free scans for public repositories connected to this local CE instance.",
		Ready:       store.Ping,
		Tick: func(tickCtx context.Context) (ceruntime.TickResult, error) {
			count, tickErr := store.EnqueueDueAutoScans(
				tickCtx,
				scanInterval,
				intEnv("FLYTO_CE_SCHEDULER_BATCH", 25),
			)
			return ceruntime.TickResult{Processed: count}, tickErr
		},
	})
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE scheduler stopped", "error", err)
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

func intEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}
