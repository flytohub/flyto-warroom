// Package liveevent — PG LISTEN/NOTIFY cross-pod bridge.
//
// Background: Hub.Publish lives in-memory per pod. With Cloud Run
// max-instances > 1, a workspace SSE subscriber on pod-A misses
// events fired on pod-B. PGBridge solves this:
//   - Publish() side-effect: NOTIFY flyto_events with JSON payload
//   - Subscribe() side: LISTEN flyto_events, fan-out into local Hub
//
// One LISTEN connection per pod (long-lived). Idempotent — duplicate
// payloads (same event ID) are dropped by the subscriber's dedup
// window. Falls back to in-memory-only when Bridge is nil.
package liveevent

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const (
	pgChannelName    = "flyto_events"
	pgPayloadMaxSize = 7900 // PG NOTIFY payload limit is 8000 bytes
)

// PGBridge bridges a Hub to a PG LISTEN/NOTIFY channel for
// cross-pod event distribution. Construct with NewPGBridge and
// attach via Hub.SetBridge.
type PGBridge struct {
	db       *sql.DB
	hub      *Hub
	origin   string
	stop     chan struct{}
	stopOnce sync.Once
}

type pgEventEnvelope struct {
	Origin string `json:"origin"`
	Event  Event  `json:"event"`
}

var pgBridgeOriginFallback atomic.Uint64

// NewPGBridge constructs a bridge backed by the given *sql.DB
// (pgx-wrapped via "pgx" driver). The listener is NOT started —
// call Start(ctx) to begin LISTEN-ing + relaying.
func NewPGBridge(db *sql.DB, hub *Hub) *PGBridge {
	return &PGBridge{
		db:     db,
		hub:    hub,
		origin: newPGBridgeOrigin(),
		stop:   make(chan struct{}),
	}
}

func newPGBridgeOrigin() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf(
		"fallback-%d-%d",
		time.Now().UnixNano(),
		pgBridgeOriginFallback.Add(1),
	)
}

// Start opens a dedicated LISTEN session via pgx native conn
// (via stdlib.AcquireConn). Blocking — caller should
// `go bridge.Start(ctx)`. Reconnects on connection drop with
// 5s backoff.
func (b *PGBridge) Start(ctx context.Context) {
	if b == nil || b.db == nil {
		slog.Warn("liveevent.pg_bridge: no DB, bridge disabled")
		return
	}
	slog.Info("liveevent.pg_bridge: starting", "channel", pgChannelName)
	for {
		select {
		case <-ctx.Done():
			return
		case <-b.stop:
			return
		default:
		}
		if err := b.runOneSession(ctx); err != nil {
			slog.Warn("liveevent.pg_bridge: session ended", "err", err)
		}
		// Backoff before reconnect.
		select {
		case <-ctx.Done():
			return
		case <-b.stop:
			return
		case <-time.After(5 * time.Second):
		}
	}
}

// runOneSession holds a dedicated PG connection via pgx native
// API (using conn.Raw to escape database/sql wrapper), issues
// LISTEN, then loops WaitForNotification until ctx done or
// connection drops.
func (b *PGBridge) runOneSession(ctx context.Context) error {
	sqlConn, err := b.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer sqlConn.Close()

	// Pin to the native *pgx.Conn so WaitForNotification works
	// directly. Hold the *sql.Conn through Raw() so the pool
	// doesn't reuse it for other queries.
	return sqlConn.Raw(func(dc any) error {
		stdlibConn, ok := dc.(*stdlib.Conn)
		if !ok {
			return errors.New("pg_bridge: not a pgx stdlib conn")
		}
		pgxConn := stdlibConn.Conn()
		if _, err := pgxConn.Exec(ctx, `LISTEN `+pgChannelName); err != nil {
			return err
		}
		for {
			select {
			case <-ctx.Done():
				return nil
			case <-b.stop:
				return nil
			default:
			}
			// 30s timeout so a dead TCP socket eventually
			// surfaces + the outer loop reconnects.
			notifyCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			n, err := pgxConn.WaitForNotification(notifyCtx)
			cancel()
			if err != nil {
				if ctx.Err() != nil {
					return nil
				}
				if errors.Is(err, context.DeadlineExceeded) {
					continue
				}
				return err
			}
			if n == nil || n.Channel != pgChannelName {
				continue
			}
			b.relayInbound(n.Payload)
			_ = pgx.ErrNoRows // ensure pgx import is used somewhere
		}
	})
}

func (b *PGBridge) Stop() {
	if b == nil {
		return
	}
	b.stopOnce.Do(func() { close(b.stop) })
}

// Publish — called by Hub.Publish for cross-pod fan-out. Sends
// NOTIFY with a JSON envelope. Receivers (other pods' bridges)
// will LISTEN and re-publish into their local Hub.
//
// Best-effort: NOTIFY failures are logged but never returned —
// local subscribers still got the in-memory delivery so the
// user-visible UX stays responsive even when bridge is broken.
func (b *PGBridge) Publish(ctx context.Context, ev Event) {
	if b == nil || b.db == nil {
		return
	}
	payload, err := json.Marshal(pgEventEnvelope{Origin: b.origin, Event: ev})
	if err != nil {
		slog.Warn("liveevent.pg_bridge: marshal failed", "err", err)
		return
	}
	if len(payload) > pgPayloadMaxSize {
		slog.Warn("liveevent.pg_bridge: payload too large for NOTIFY",
			"size", len(payload), "type", ev.Type)
		return
	}
	_, err = b.db.ExecContext(ctx, `SELECT pg_notify($1, $2)`, pgChannelName, string(payload))
	if err != nil {
		slog.Warn("liveevent.pg_bridge: NOTIFY failed", "err", err)
	}
}

func (b *PGBridge) relayInbound(payload string) {
	if b.hub == nil {
		return
	}
	var envelope pgEventEnvelope
	if err := json.Unmarshal([]byte(payload), &envelope); err != nil {
		slog.Warn("liveevent.pg_bridge: bad payload", "err", err)
		return
	}
	if envelope.Origin != "" {
		if envelope.Origin == b.origin {
			return
		}
		if envelope.Event.WorkspaceID == "" || envelope.Event.Type == "" {
			slog.Warn("liveevent.pg_bridge: incomplete event envelope")
			return
		}
		b.hub.publishLocal(envelope.Event)
		return
	}

	// Compatibility with events emitted by pre-origin bridge versions during
	// a rolling deployment.
	var ev Event
	if err := json.Unmarshal([]byte(payload), &ev); err != nil {
		slog.Warn("liveevent.pg_bridge: bad payload", "err", err)
		return
	}
	if ev.WorkspaceID == "" || ev.Type == "" {
		slog.Warn("liveevent.pg_bridge: incomplete legacy event")
		return
	}
	b.hub.publishLocal(ev)
}
