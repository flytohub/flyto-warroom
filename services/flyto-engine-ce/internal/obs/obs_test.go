package obs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestRequestIDContextRoundtrip(t *testing.T) {
	ctx := WithRequestID(context.Background(), "abc")
	if got := RequestIDFromContext(ctx); got != "abc" {
		t.Fatalf("got %q", got)
	}
}

func TestTraceIDContextRoundtrip(t *testing.T) {
	ctx := WithTraceID(context.Background(), "trace-1")
	if got := TraceIDFromContext(ctx); got != "trace-1" {
		t.Fatalf("got %q", got)
	}
}

func TestRequestIDFromContext_NilSafe(t *testing.T) {
	// Must not panic on a nil context — defensive caller pattern.
	if got := RequestIDFromContext(nil); got != "" {
		t.Errorf("nil ctx should yield empty, got %q", got)
	}
	if got := TraceIDFromContext(nil); got != "" {
		t.Errorf("nil ctx should yield empty, got %q", got)
	}
}

func TestRequestIDFromContext_MissingKeyReturnsEmpty(t *testing.T) {
	ctx := context.Background()
	if got := RequestIDFromContext(ctx); got != "" {
		t.Errorf("plain ctx should yield empty, got %q", got)
	}
}

func TestLogger_EnrichesWithRequestID(t *testing.T) {
	var buf bytes.Buffer
	base := slog.New(slog.NewJSONHandler(&buf, nil))
	ctx := WithLogger(context.Background(), base)
	ctx = WithRequestID(ctx, "rid-42")
	ctx = WithTraceID(ctx, "tid-7")

	Logger(ctx).Info("hello", "extra", "val")

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("non-json log: %s", buf.String())
	}
	if line["request_id"] != "rid-42" {
		t.Errorf("request_id missing: %v", line)
	}
	if line["trace_id"] != "tid-7" {
		t.Errorf("trace_id missing: %v", line)
	}
	if !strings.Contains(buf.String(), `"msg":"hello"`) {
		t.Errorf("message missing: %s", buf.String())
	}
}

func TestLogger_FallsBackToDefaultOnBareContext(t *testing.T) {
	// No logger in ctx — must still hand back something usable.
	lg := Logger(context.Background())
	if lg == nil {
		t.Fatal("Logger must never return nil")
	}
}

func TestSetAndGetDefault(t *testing.T) {
	orig := Default()
	t.Cleanup(func() { SetDefault(orig) })

	var buf bytes.Buffer
	custom := slog.New(slog.NewJSONHandler(&buf, nil))
	SetDefault(custom)

	Default().Info("via default")
	if !strings.Contains(buf.String(), `"msg":"via default"`) {
		t.Errorf("custom default didn't capture: %s", buf.String())
	}
}

func TestNewID_Uniqueness(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id := NewID()
		if len(id) != 16 {
			t.Fatalf("NewID should be 16 hex chars, got %d (%q)", len(id), id)
		}
		if seen[id] {
			t.Errorf("collision at iteration %d: %s", i, id)
		}
		seen[id] = true
	}
}

func TestNewJSONLogger_RespectsLevel(t *testing.T) {
	var buf bytes.Buffer
	lg := NewJSONLogger(&buf, slog.LevelWarn)
	lg.Info("should be dropped")
	lg.Warn("should appear")
	out := buf.String()
	if strings.Contains(out, "should be dropped") {
		t.Errorf("info-level line leaked past Warn threshold: %s", out)
	}
	if !strings.Contains(out, "should appear") {
		t.Errorf("warn line missing: %s", out)
	}
}
