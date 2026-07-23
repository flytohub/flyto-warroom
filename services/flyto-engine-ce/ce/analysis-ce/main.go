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
		obs.Default().Error("Flyto2 Warroom CE analysis initialization failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	err = ceruntime.Run(ctx, ceruntime.Config{
		Name:        "analysis-ce",
		SourcePath:  "ce/analysis-ce",
		Addr:        addressEnv("FLYTO_CE_ANALYSIS_ADDR", ":8083"),
		Interval:    durationEnv("FLYTO_CE_ANALYSIS_TICK", 2*time.Second),
		Description: "Builds transparent local evidence, remediation guidance, and non-authoritative risk-chain hypotheses.",
		Ready:       store.Ping,
		Tick: func(tickCtx context.Context) (ceruntime.TickResult, error) {
			work, claimed, tickErr := store.ClaimAnalysis(tickCtx)
			if tickErr != nil || !claimed {
				return ceruntime.TickResult{}, tickErr
			}
			result := ceworkflow.Analyze(work)
			if tickErr = store.CompleteAnalysis(
				tickCtx,
				work,
				result.AttackPaths,
				result.Evidence,
				result.Remediations,
			); tickErr != nil {
				_ = store.FailAnalysis(tickCtx, work.Scan.ID, tickErr)
				return ceruntime.TickResult{}, tickErr
			}
			return ceruntime.TickResult{Processed: 1}, nil
		},
	})
	if err != nil {
		obs.Default().Error("Flyto2 Warroom CE analysis stopped", "error", err)
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
