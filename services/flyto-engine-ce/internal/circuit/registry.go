package circuit

import "sync"

// Registry is the process-wide map of named breakers. Use Get to look
// up an existing breaker (creating it with sensible defaults if it's
// the first call). Concrete consumers (ai dispatcher, github poller,
// threatfeed worker) call Default().Get(name) at init time and keep
// the *Breaker.
//
// One breaker per logical upstream — not per endpoint. "github" is
// one breaker, "openai" is one breaker. Don't shard further unless
// the failure modes are genuinely independent (e.g. github-rest vs
// github-graphql when the former pages and the latter doesn't).
type Registry struct {
	mu       sync.Mutex
	breakers map[string]*Breaker
}

// NewRegistry returns an empty registry. Most callers want Default().
func NewRegistry() *Registry {
	return &Registry{breakers: map[string]*Breaker{}}
}

// Get returns the breaker for name, creating it with DefaultConfig
// when absent. Safe for concurrent use.
func (r *Registry) Get(name string) *Breaker {
	r.mu.Lock()
	defer r.mu.Unlock()
	if b, ok := r.breakers[name]; ok {
		return b
	}
	b := New(DefaultConfig(name))
	r.breakers[name] = b
	return b
}

// Configure registers a breaker with non-default Config. Idempotent —
// re-registering the same name replaces the existing breaker. Call
// during init before any traffic so the swap doesn't race.
func (r *Registry) Configure(cfg Config) *Breaker {
	r.mu.Lock()
	defer r.mu.Unlock()
	b := New(cfg)
	r.breakers[cfg.Name] = b
	return b
}

// All returns a snapshot of every registered breaker's name + state.
// Used by the metrics endpoint to expose breaker health.
func (r *Registry) All() map[string]State {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]State, len(r.breakers))
	for name, b := range r.breakers {
		out[name] = b.State()
	}
	return out
}

var (
	defaultRegistryOnce sync.Once
	defaultRegistry     *Registry
)

// Default returns the process-wide registry. Lazy-initialised on first
// call so test code that constructs its own registry can do so via
// NewRegistry without colliding with production state.
func Default() *Registry {
	defaultRegistryOnce.Do(func() {
		defaultRegistry = NewRegistry()
	})
	return defaultRegistry
}
