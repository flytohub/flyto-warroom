package liveevent

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewHub(t *testing.T) {
	h := NewHub()
	if h == nil {
		t.Fatal("NewHub returned nil")
	}
	if h.TotalSubscribers() != 0 {
		t.Errorf("new hub should have 0 subscribers, got %d", h.TotalSubscribers())
	}
}

func TestSubscribeAndPublish(t *testing.T) {
	h := NewHub()
	var got Event
	done := make(chan struct{})

	unsub := h.Subscribe("ws-1", func(e Event) {
		got = e
		close(done)
	})
	defer unsub()

	h.Publish("ws-1", EventResourceCreated, map[string]any{"resourceId": "r-1"})

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}

	if got.Type != EventResourceCreated {
		t.Errorf("type = %q, want %q", got.Type, EventResourceCreated)
	}
	if got.WorkspaceID != "ws-1" {
		t.Errorf("workspaceId = %q, want %q", got.WorkspaceID, "ws-1")
	}
	if got.ID == 0 {
		t.Error("event ID should be > 0")
	}
	if got.Timestamp.IsZero() {
		t.Error("timestamp should be set")
	}
	if got.Payload["resourceId"] != "r-1" {
		t.Errorf("payload resourceId = %v, want r-1", got.Payload["resourceId"])
	}
}

func TestUnsubscribe(t *testing.T) {
	h := NewHub()
	var count atomic.Int32

	unsub := h.Subscribe("ws-1", func(e Event) {
		count.Add(1)
	})

	h.Publish("ws-1", EventResourceCreated, nil)
	time.Sleep(50 * time.Millisecond) // let goroutine run

	unsub()

	h.Publish("ws-1", EventResourceCreated, nil)
	time.Sleep(50 * time.Millisecond)

	if c := count.Load(); c != 1 {
		t.Errorf("expected 1 event after unsubscribe, got %d", c)
	}
	if h.SubscriberCount("ws-1") != 0 {
		t.Errorf("subscriber count should be 0 after unsubscribe, got %d", h.SubscriberCount("ws-1"))
	}
}

func TestWorkspaceIsolation(t *testing.T) {
	h := NewHub()
	var ws1Count, ws2Count atomic.Int32

	unsub1 := h.Subscribe("ws-1", func(e Event) { ws1Count.Add(1) })
	defer unsub1()
	unsub2 := h.Subscribe("ws-2", func(e Event) { ws2Count.Add(1) })
	defer unsub2()

	h.Publish("ws-1", EventProjectCreated, nil)
	time.Sleep(50 * time.Millisecond)

	if ws1Count.Load() != 1 {
		t.Errorf("ws-1 should get 1 event, got %d", ws1Count.Load())
	}
	if ws2Count.Load() != 0 {
		t.Errorf("ws-2 should get 0 events, got %d", ws2Count.Load())
	}
}

func TestMultipleSubscribers(t *testing.T) {
	h := NewHub()
	var count atomic.Int32

	for i := 0; i < 5; i++ {
		unsub := h.Subscribe("ws-1", func(e Event) { count.Add(1) })
		defer unsub()
	}

	if h.SubscriberCount("ws-1") != 5 {
		t.Fatalf("expected 5 subscribers, got %d", h.SubscriberCount("ws-1"))
	}

	h.Publish("ws-1", EventResourceCreated, nil)
	time.Sleep(100 * time.Millisecond)

	if c := count.Load(); c != 5 {
		t.Errorf("all 5 subscribers should receive event, got %d", c)
	}
}

func TestEventIDsUniqueAndPositive(t *testing.T) {
	h := NewHub()
	ids := make(chan uint64, 10)

	unsub := h.Subscribe("ws-1", func(e Event) { ids <- e.ID })

	for i := 0; i < 10; i++ {
		h.Publish("ws-1", EventResourceCreated, nil)
	}

	// Unsubscribe first — this drains the per-subscriber buffer and waits
	// for the delivery goroutine to exit, so no writer is still racing with
	// close(ids) below.
	unsub()
	close(ids)

	seen := make(map[uint64]bool)
	for id := range ids {
		if id == 0 {
			t.Error("event ID should be > 0")
		}
		if seen[id] {
			t.Errorf("duplicate event ID: %d", id)
		}
		seen[id] = true
	}
	if len(seen) != 10 {
		t.Errorf("expected 10 unique IDs, got %d", len(seen))
	}
}

func TestConcurrentPublish(t *testing.T) {
	h := NewHub()
	var count atomic.Int64

	unsub := h.Subscribe("ws-1", func(e Event) { count.Add(1) })
	defer unsub()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			h.Publish("ws-1", EventResourceCreated, nil)
		}()
	}
	wg.Wait()
	time.Sleep(200 * time.Millisecond)

	if c := count.Load(); c != 100 {
		t.Errorf("expected 100 events, got %d", c)
	}
}

func TestConcurrentSubscribeUnsubscribe(t *testing.T) {
	h := NewHub()
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			unsub := h.Subscribe("ws-1", func(e Event) {})
			time.Sleep(time.Millisecond)
			unsub()
		}()
	}
	wg.Wait()

	if h.SubscriberCount("ws-1") != 0 {
		t.Errorf("all unsubscribed, count should be 0, got %d", h.SubscriberCount("ws-1"))
	}
}

func TestConcurrentPublishUnsubscribeDoesNotRaceOrPanic(t *testing.T) {
	h := NewHub()
	var wg sync.WaitGroup
	stop := make(chan struct{})

	unsubscribers := make([]func(), 0, 64)
	for i := 0; i < 64; i++ {
		unsubscribers = append(unsubscribers, h.Subscribe("ws-1", func(e Event) {}))
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				h.Publish("ws-1", EventResourceCreated, nil)
			}
		}
	}()

	for _, unsub := range unsubscribers {
		unsub()
	}
	close(stop)
	wg.Wait()
	if got := h.SubscriberCount("ws-1"); got != 0 {
		t.Fatalf("subscriber count = %d, want 0", got)
	}
}

func TestPublishToEmptyWorkspace(t *testing.T) {
	h := NewHub()
	// Should not panic
	h.Publish("ws-nonexistent", EventResourceCreated, nil)
}

func TestDroppedEventsCounter(t *testing.T) {
	h := NewHub()
	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once

	unsub := h.Subscribe("ws-1", func(e Event) {
		once.Do(func() { close(started) })
		<-release
	})

	h.Publish("ws-1", EventResourceCreated, nil)
	select {
	case <-started:
	case <-time.After(time.Second):
		close(release)
		unsub()
		t.Fatal("timed out waiting for blocked subscriber")
	}

	for i := 0; i < subscriberBufferSize+10; i++ {
		h.Publish("ws-1", EventResourceCreated, nil)
	}
	if got := h.DroppedEvents(); got == 0 {
		close(release)
		unsub()
		t.Fatal("expected dropped event counter to increment")
	}

	close(release)
	unsub()
	if got := h.DroppedEvents(); got == 0 {
		t.Fatal("dropped event counter should remain cumulative after unsubscribe")
	}
}

func TestSubscriberCountAndTotal(t *testing.T) {
	h := NewHub()
	u1 := h.Subscribe("ws-1", func(e Event) {})
	u2 := h.Subscribe("ws-1", func(e Event) {})
	u3 := h.Subscribe("ws-2", func(e Event) {})

	if h.SubscriberCount("ws-1") != 2 {
		t.Errorf("ws-1 count = %d, want 2", h.SubscriberCount("ws-1"))
	}
	if h.SubscriberCount("ws-2") != 1 {
		t.Errorf("ws-2 count = %d, want 1", h.SubscriberCount("ws-2"))
	}
	if h.TotalSubscribers() != 3 {
		t.Errorf("total = %d, want 3", h.TotalSubscribers())
	}

	u1()
	u2()
	u3()

	if h.TotalSubscribers() != 0 {
		t.Errorf("total after unsub = %d, want 0", h.TotalSubscribers())
	}
}

func TestMarshalEvent(t *testing.T) {
	e := Event{
		ID:          42,
		WorkspaceID: "ws-1",
		Type:        EventResourceCreated,
		Payload:     map[string]any{"key": "val"},
		Timestamp:   time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC),
	}
	b := MarshalEvent(e)
	if b == nil {
		t.Fatal("MarshalEvent returned nil")
	}

	var decoded Event
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.ID != 42 {
		t.Errorf("id = %d, want 42", decoded.ID)
	}
	if decoded.Type != EventResourceCreated {
		t.Errorf("type = %q, want %q", decoded.Type, EventResourceCreated)
	}
	if decoded.Payload["key"] != "val" {
		t.Errorf("payload key = %v, want val", decoded.Payload["key"])
	}
}

func TestMarshalEventNilPayload(t *testing.T) {
	e := Event{ID: 1, Type: EventProjectCreated}
	b := MarshalEvent(e)
	if b == nil {
		t.Fatal("MarshalEvent returned nil for nil payload")
	}
	// Should not contain "payload" key when nil
	var m map[string]any
	json.Unmarshal(b, &m)
	if _, ok := m["payload"]; ok {
		t.Error("nil payload should be omitted from JSON")
	}
}

func TestDoubleUnsubscribeSafe(t *testing.T) {
	h := NewHub()
	unsub := h.Subscribe("ws-1", func(e Event) {})
	unsub()
	unsub() // should not panic
}

func TestAllEventTypes(t *testing.T) {
	types := []EventType{
		EventResourceCreated, EventResourceUpdated, EventResourceDeleted,
		EventProjectCreated, EventProjectUpdated, EventProjectDeleted,
		EventFolderCreated, EventFolderUpdated, EventFolderDeleted,
		EventPipelineProgress, EventPipelineComplete, EventPipelineFailed,
		EventScanQueued, EventScanRunning, EventScanComplete, EventScanFailed,
		EventAlertCreated, EventAlertResolved,
		EventActivityLogged,
	}
	for _, et := range types {
		if et == "" {
			t.Errorf("event type constant is empty")
		}
	}
	// Ensure no duplicates
	seen := make(map[EventType]bool)
	for _, et := range types {
		if seen[et] {
			t.Errorf("duplicate event type: %s", et)
		}
		seen[et] = true
	}
}
