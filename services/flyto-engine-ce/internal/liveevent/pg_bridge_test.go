package liveevent

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPGBridgeRelaySkipsSelfEcho(t *testing.T) {
	hub := NewHub()
	bridge := NewPGBridge(nil, hub)
	received := make(chan Event, 1)
	unsubscribe := hub.Subscribe("ws-1", func(ev Event) { received <- ev })
	defer unsubscribe()

	payload, err := json.Marshal(pgEventEnvelope{
		Origin: bridge.origin,
		Event:  Event{ID: 1, WorkspaceID: "ws-1", Type: EventResourceCreated},
	})
	if err != nil {
		t.Fatal(err)
	}
	bridge.relayInbound(string(payload))

	select {
	case ev := <-received:
		t.Fatalf("self echo was delivered: %#v", ev)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPGBridgeRelayDeliversForeignOrigin(t *testing.T) {
	hub := NewHub()
	bridge := NewPGBridge(nil, hub)
	received := make(chan Event, 1)
	unsubscribe := hub.Subscribe("ws-1", func(ev Event) { received <- ev })
	defer unsubscribe()

	want := Event{ID: 42, WorkspaceID: "ws-1", Type: EventResourceUpdated}
	payload, err := json.Marshal(pgEventEnvelope{Origin: "another-engine", Event: want})
	if err != nil {
		t.Fatal(err)
	}
	bridge.relayInbound(string(payload))

	select {
	case got := <-received:
		if got.ID != want.ID || got.Type != want.Type {
			t.Fatalf("received %#v, want %#v", got, want)
		}
	case <-time.After(time.Second):
		t.Fatal("foreign event was not delivered")
	}
}

func TestPGBridgeRelayAcceptsLegacyEventDuringRollingDeploy(t *testing.T) {
	hub := NewHub()
	bridge := NewPGBridge(nil, hub)
	received := make(chan Event, 1)
	unsubscribe := hub.Subscribe("ws-legacy", func(ev Event) { received <- ev })
	defer unsubscribe()

	want := Event{ID: 7, WorkspaceID: "ws-legacy", Type: EventResourceDeleted}
	payload, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	bridge.relayInbound(string(payload))

	select {
	case got := <-received:
		if got.ID != want.ID || got.Type != want.Type {
			t.Fatalf("received %#v, want %#v", got, want)
		}
	case <-time.After(time.Second):
		t.Fatal("legacy event was not delivered")
	}
}

func TestPGBridgeStopIsIdempotent(t *testing.T) {
	bridge := NewPGBridge(nil, NewHub())
	bridge.Stop()
	bridge.Stop()
}
