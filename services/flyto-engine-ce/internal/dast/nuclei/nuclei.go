package nuclei

// Package nuclei — Nuclei DAST engine wrapper.
//
// Design constraints (per advisor 2026-05-18):
//
//   1. Every target MUST have an approved scan_approval row.
//      The caller (worker loop) is responsible for filtering;
//      this package will refuse to run with empty Targets to
//      reduce the chance of a callsite bug bypassing the gate.
//
//   2. DEFAULT TEMPLATE SET IS CONSERVATIVE — tls / dns /
//      http-misconfig / exposed-panels / known-cve detection.
//      We deliberately do NOT enable fuzzing, credential
//      attempts, or destructive templates by default. Operators
//      can opt-in to more aggressive sets per asset.
//
//   3. Output flagged verification_method=active_verified so
//      the UI can distinguish "passive" findings from "actively
//      validated" ones. Authenticated_dast scan_type sets
//      verification_method=authenticated_verified.
//
// Honest scope: this package wraps the Nuclei binary the same
// way internal/containerscan/trivy.go wraps trivy — we don't
// re-implement Nuclei templates ourselves. Caller is responsible
// for shipping the binary in the runtime image + invoking
// `nuclei -update` before first run.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// DefaultTemplateTags is the conservative template set Active DAST
// uses unless explicitly extended per-asset. Mirrors what reputable
// SaaS scanners ship as "production-safe" defaults.
//
// Excluded by default:
//   - fuzz, brute, intrusive (high false-positive + traffic cost)
//   - default-logins (credential guessing — needs explicit consent)
//   - dos (denial-of-service — never run without sandbox approval)
//   - exposures (broad fishing, much of which overlaps Discovery)
var DefaultTemplateTags = []string{
	"tls",
	"dns",
	"misconfig",
	"exposed-panels",
	"cve",
	"network",
	"ssl",
}

// Severity ladder we accept. info findings dropped — too noisy
// for an MVP "we found exposure" narrative.
var DefaultMinSeverity = "low"

// Target is one DAST run input. Caller MUST verify
// store.IsAssetApproved for the (org, asset_id, ScanType) before
// constructing one of these.
type Target struct {
	URL        string
	AssetID    string
	ScanType   string // active_dast | authenticated_dast
	AuthCookie string // optional; populates -header Cookie
	AuthBearer string // optional; populates -header Authorization
}

// Finding is one normalized Nuclei verdict.
type Finding struct {
	TargetURL   string   `json:"target_url"`
	AssetID     string   `json:"asset_id"`
	TemplateID  string   `json:"template_id"`
	Name        string   `json:"name"`
	Severity    string   `json:"severity"`
	Description string   `json:"description"`
	MatchedAt   string   `json:"matched_at"`
	Reference   string   `json:"reference,omitempty"`
	CVEs        []string `json:"cves,omitempty"`
	// VerificationMethod is the column the persistence layer
	// writes into external_issue_tracker.verification_method.
	// `active_verified` for unauth DAST, `authenticated_verified`
	// when AuthCookie/AuthBearer was supplied.
	VerificationMethod string `json:"verification_method"`
}

// Engine wraps the Nuclei binary. Path can override the default
// `nuclei` PATH lookup — tests set this to a stub script that
// emits canned JSON.
type Engine struct {
	BinaryPath string
	// Timeout per-target. Nuclei tunes its own concurrency
	// internally; we cap wall-clock so a hanging upstream
	// can't stall a sweep.
	Timeout time.Duration
}

func NewEngine() *Engine {
	return &Engine{
		BinaryPath: "nuclei",
		Timeout:    2 * time.Minute,
	}
}

// Available reports whether the Nuclei binary is reachable. The
// worker uses this at boot to skip the loop entirely when the
// binary isn't baked into the image — same pattern as
// internal/containerscan.Available().
func (e *Engine) Available() bool {
	_, err := exec.LookPath(e.BinaryPath)
	return err == nil
}

// Scan runs Nuclei against the target with the default
// conservative template set. Returns the list of normalized
// findings. Empty result = nothing matched (clean target);
// not an error.
func (e *Engine) Scan(ctx context.Context, t Target) ([]Finding, error) {
	if t.URL == "" {
		return nil, errors.New("nuclei: target URL required")
	}
	if t.AssetID == "" {
		return nil, errors.New("nuclei: target asset_id required (used for verification_method writeback)")
	}
	scanType := t.ScanType
	if scanType == "" {
		scanType = "active_dast"
	}

	runCtx, cancel := context.WithTimeout(ctx, e.Timeout)
	defer cancel()

	args := []string{
		"-u", t.URL,
		"-json",
		// -no-color avoids escape codes in stdout that break JSON.
		"-no-color",
		// Disable update inside the scan path — we want
		// deterministic templates per sweep; the worker handles
		// nuclei -update on its own cadence.
		"-disable-update-check",
		"-silent",
		"-severity", DefaultMinSeverity + ",medium,high,critical",
	}
	for _, tag := range DefaultTemplateTags {
		args = append(args, "-tags", tag)
	}
	if t.AuthCookie != "" {
		args = append(args, "-H", "Cookie: "+t.AuthCookie)
	}
	if t.AuthBearer != "" {
		args = append(args, "-H", "Authorization: Bearer "+t.AuthBearer)
	}

	cmd := exec.CommandContext(runCtx, e.BinaryPath, args...)
	out, err := cmd.Output()
	if err != nil {
		// Nuclei exits non-zero when it finds matches (sometimes).
		// Don't fail-fast on exit code — parse output regardless;
		// only error when the process couldn't run at all.
		if _, isExit := err.(*exec.ExitError); !isExit {
			return nil, fmt.Errorf("nuclei: exec %s: %w", t.URL, err)
		}
	}

	verifMethod := "active_verified"
	if t.AuthCookie != "" || t.AuthBearer != "" {
		verifMethod = "authenticated_verified"
	}

	return parseNucleiJSON(out, t, verifMethod), nil
}

// parseNucleiJSON parses Nuclei's JSON-lines output.
func parseNucleiJSON(out []byte, t Target, verifMethod string) []Finding {
	var findings []Finding
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var row struct {
			TemplateID string `json:"template-id"`
			Info       struct {
				Name           string   `json:"name"`
				Severity       string   `json:"severity"`
				Description    string   `json:"description"`
				Reference      []string `json:"reference"`
				Classification struct {
					CVEs []string `json:"cve-id"`
				} `json:"classification"`
			} `json:"info"`
			MatchedAt string `json:"matched-at"`
			Host      string `json:"host"`
		}
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		if row.Info.Severity == "info" || row.Info.Severity == "unknown" {
			continue
		}
		f := Finding{
			TargetURL:          t.URL,
			AssetID:            t.AssetID,
			TemplateID:         row.TemplateID,
			Name:               row.Info.Name,
			Severity:           strings.ToLower(row.Info.Severity),
			Description:        row.Info.Description,
			MatchedAt:          row.MatchedAt,
			CVEs:               row.Info.Classification.CVEs,
			VerificationMethod: verifMethod,
		}
		if len(row.Info.Reference) > 0 {
			f.Reference = row.Info.Reference[0]
		}
		findings = append(findings, f)
	}
	return findings
}
