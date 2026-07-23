package httpx

import (
	"net"
	"net/http"
	"time"
)

// New returns the platform HTTP client baseline for outbound calls.
// Callers still choose their timeout budget; transport knobs stay centralized.
func New(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: Transport(),
	}
}

var defaultClient = New(15 * time.Second)

// Default is the standard short outbound client for simple API calls.
func Default() *http.Client {
	return defaultClient
}

// Transport returns a fresh transport so callers do not share mutable state.
func Transport() *http.Transport {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}
