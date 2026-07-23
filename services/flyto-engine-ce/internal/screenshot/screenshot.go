// Package screenshot wraps the flyto-runner /screenshot endpoint and
// persists the returned PNG to engine storage. Used by Brand
// Protection's impersonation discovery so reviewers can see what the
// lookalike domain actually looks like (parked / phishing / legit
// independent site).
//
// The runner does the Chromium work; this package is the engine-side
// thin HTTP client + storage glue. Failures here are non-fatal — the
// caller treats them as "screenshot pending" rather than failing the
// discovery.
package screenshot

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/httpx"
)

// Result is what the runner returns, mirrored here so callers don't
// have to import a Python schema. `PNG` is the decoded image bytes
// when `OK` is true.
type Result struct {
	OK            bool              `json:"ok"`
	Title         string            `json:"title,omitempty"`
	FinalURL      string            `json:"final_url,omitempty"`
	Status        int               `json:"status,omitempty"`
	Error         string            `json:"error,omitempty"`
	PNG           []byte            `json:"-"`
	Headers       map[string]string `json:"headers,omitempty"`
	MetaGenerator string            `json:"meta_generator,omitempty"`
	HTMLText      string            `json:"html_text,omitempty"`
}

// Client knows how to call the runner's /screenshot endpoint. Hold
// one per process; safe for concurrent use.
type Client struct {
	BaseURL string
	Secret  string
	HTTP    *http.Client
}

// NewFromEnv reads FLYTO_RUNNER_URL + FLYTO_RUNNER_SECRET. Returns
// nil when the runner URL isn't configured so callers can short-
// circuit ("screenshots disabled") rather than fail.
func NewFromEnv() *Client {
	base := strings.TrimSpace(os.Getenv("FLYTO_RUNNER_URL"))
	if base == "" {
		return nil
	}
	return &Client{
		BaseURL: strings.TrimRight(base, "/"),
		Secret:  strings.TrimSpace(os.Getenv("FLYTO_RUNNER_SECRET")),
		// 20 s — runner caps page nav at 8 s, leaves room for
		// browser launch + body encoding. A longer wall-clock here
		// just makes scan latency worse if the runner is stuck.
		HTTP: httpx.New(20 * time.Second),
	}
}

// Capture POSTs to /runner/v1/screenshot and decodes the response.
// Returns an OK=false Result with the error reason when the runner
// rejects or fails to render — the PNG slice will be empty in that
// case, so callers should always check `r.OK` before persisting.
func (c *Client) Capture(ctx context.Context, url string) (*Result, error) {
	if c == nil {
		return &Result{OK: false, Error: "screenshot client disabled (FLYTO_RUNNER_URL unset)"}, nil
	}

	body, _ := json.Marshal(map[string]string{"url": url})
	req, err := http.NewRequestWithContext(ctx, "POST",
		c.BaseURL+"/runner/v1/screenshot", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Secret != "" {
		req.Header.Set("X-Internal-Key", c.Secret)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("runner screenshot: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("runner screenshot http %d: %s",
			resp.StatusCode, truncate(string(raw), 200))
	}

	var wire struct {
		OK            bool              `json:"ok"`
		Title         string            `json:"title,omitempty"`
		FinalURL      string            `json:"final_url,omitempty"`
		Status        int               `json:"status,omitempty"`
		Error         string            `json:"error,omitempty"`
		PNGB64        string            `json:"png_b64,omitempty"`
		Headers       map[string]string `json:"headers,omitempty"`
		MetaGenerator string            `json:"meta_generator,omitempty"`
		HTMLText      string            `json:"html_text,omitempty"`
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		return nil, fmt.Errorf("decode screenshot response: %w", err)
	}

	out := &Result{
		OK:            wire.OK,
		Title:         wire.Title,
		FinalURL:      wire.FinalURL,
		Status:        wire.Status,
		Error:         wire.Error,
		Headers:       wire.Headers,
		MetaGenerator: wire.MetaGenerator,
		HTMLText:      wire.HTMLText,
	}
	if wire.OK && wire.PNGB64 != "" {
		png, derr := base64.StdEncoding.DecodeString(wire.PNGB64)
		if derr != nil {
			return nil, fmt.Errorf("decode png_b64: %w", derr)
		}
		if len(png) == 0 {
			return nil, errors.New("runner returned empty PNG body")
		}
		out.PNG = png
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
