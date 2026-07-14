package canary

// Minimal in-memory RegressionStore — sufficient for the MVP since
// regressed-scanner state lives <24h and we run a single engine
// process. Promote to DB-backed when we need cross-replica sharing.

import (
	"context"
	"sync"
	"time"
)

type inMemStore struct {
	mu     sync.RWMutex
	flags  map[string]time.Time // scanner -> "regressed until"
	reason map[string]string
}

func NewInMemStore() RegressionStore {
	return &inMemStore{
		flags:  make(map[string]time.Time),
		reason: make(map[string]string),
	}
}

func (s *inMemStore) MarkRegressed(_ context.Context, scanner, reason string, until time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.flags[scanner] = until
	s.reason[scanner] = reason
	return nil
}

func (s *inMemStore) IsRegressed(_ context.Context, scanner string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	until, ok := s.flags[scanner]
	if !ok {
		return false, nil
	}
	if time.Now().After(until) {
		// Stale — but don't auto-clean here; reader should call
		// Clear if it wants to garbage-collect.
		return false, nil
	}
	return true, nil
}

func (s *inMemStore) Clear(_ context.Context, scanner string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.flags, scanner)
	delete(s.reason, scanner)
	return nil
}

// Reason returns the latest regression reason for `scanner`. Empty
// string when no regression is flagged. Useful in API responses
// and audit dumps.
func (s *inMemStore) Reason(scanner string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.reason[scanner]
}
