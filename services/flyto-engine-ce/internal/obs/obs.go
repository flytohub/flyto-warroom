// Package obs wires the engine's structured logging and request-scoped
// correlation ids.
//
// One *slog.Logger serves the whole process; handlers and workers pull it
// out of context (or use the package-level Default) and let slog's
// key=value formatting do the rest. request_id / trace_id flow through
// context.Context so they appear on every log line produced during a
// request — including downstream store calls, AI dispatches, and worker
// jobs spawned by ingest.
package obs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"os"
)

type ctxKey int

const (
	ctxKeyLogger ctxKey = iota
	ctxKeyRequestID
	ctxKeyTraceID
)

// defaultLogger is the process-wide logger used when the context does not
// carry one. Set via SetDefault at program start.
var defaultLogger *slog.Logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

// SetDefault installs lg as the process-wide default.
func SetDefault(lg *slog.Logger) { defaultLogger = lg }

// Default returns the process-wide logger.
func Default() *slog.Logger { return defaultLogger }

// NewJSONLogger builds a slog JSON logger writing to out at level.
func NewJSONLogger(out io.Writer, level slog.Level) *slog.Logger {
	return slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: level}))
}

// WithLogger returns a ctx carrying lg. Downstream calls to Logger(ctx)
// get lg instead of Default().
func WithLogger(ctx context.Context, lg *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKeyLogger, lg)
}

// Logger returns the logger bound to ctx, falling back to Default and
// always enriching with request_id / trace_id if present.
func Logger(ctx context.Context) *slog.Logger {
	lg, _ := ctx.Value(ctxKeyLogger).(*slog.Logger)
	if lg == nil {
		lg = defaultLogger
	}
	if rid := RequestIDFromContext(ctx); rid != "" {
		lg = lg.With("request_id", rid)
	}
	if tid := TraceIDFromContext(ctx); tid != "" {
		lg = lg.With("trace_id", tid)
	}
	return lg
}

// WithRequestID attaches a request id to ctx.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKeyRequestID, id)
}

// RequestIDFromContext returns the request id attached to ctx, or "".
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	s, _ := ctx.Value(ctxKeyRequestID).(string)
	return s
}

// WithTraceID attaches a distributed trace id to ctx.
func WithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKeyTraceID, id)
}

// TraceIDFromContext returns the trace id attached to ctx, or "".
func TraceIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	s, _ := ctx.Value(ctxKeyTraceID).(string)
	return s
}

// NewID returns a 16-hex-char random id suitable for request / trace ids.
func NewID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
