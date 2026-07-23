// Package endpoints is the single source of truth for external HTTP
// base URLs the engine talks to. Every external service that the
// cloud-saas build calls on public internet MUST read its URL from
// here — not from a hardcoded literal.
//
// Why this exists: the engine ships in two deployment modes.
//
//	Cloud SaaS (today)       — all defaults point at public endpoints
//	                           (api.github.com, api.osv.dev, ...).
//
//	Enterprise self-hosted   — large customers refuse to let source code
//	(future, on-prem)          cross their firewall. Their builds need
//	                           to talk to GitHub Enterprise Server, an
//	                           internal OSV mirror, Verdaccio / Nexus
//	                           PyPI/npm proxies, etc. Those builds just
//	                           set env vars; no code changes, no rebuild.
//
// Keeping this package tiny is deliberate. There is no registry pattern,
// no DI, no interfaces — just env-backed getters with sensible defaults.
// If a value needs more structure than "URL string", push back before
// adding it here; the whole value is that new endpoints are a one-line
// addition and every caller knows where to look.
//
// Naming rule: every env var is `FLYTO_<service>_<what>_URL` or similar,
// never `_BASE` vs `_HOST` vs `_ENDPOINT` — pick one vocabulary per
// service type and stick to it.
package endpoints

import (
	"os"
	"strings"
)

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return strings.TrimRight(v, "/")
	}
	return fallback
}

// GitHubAPI returns the base URL of the GitHub REST API. Defaults to
// github.com's public endpoint; override with FLYTO_GITHUB_API_URL for
// GitHub Enterprise Server (e.g. "https://github.mycorp.com/api/v3").
func GitHubAPI() string {
	return envOr("FLYTO_GITHUB_API_URL", "https://api.github.com")
}

// OSVAPI returns the base URL of the OSV vulnerability database.
// Defaults to api.osv.dev; override with FLYTO_OSV_API_URL to point at
// an internal mirror of the public OSV corpus.
func OSVAPI() string {
	return envOr("FLYTO_OSV_API_URL", "https://api.osv.dev")
}

// PyPIJSON returns the base URL of the PyPI JSON API used to validate
// "does this version actually exist" before trusting an AI-suggested
// fix version. Defaults to pypi.org/pypi; override with FLYTO_PYPI_URL
// to hit a Warehouse-compatible mirror (Nexus, Artifactory, devpi).
func PyPIJSON() string {
	return envOr("FLYTO_PYPI_URL", "https://pypi.org/pypi")
}

// NPMRegistry returns the base URL of an npm-compatible registry used
// for version validation. Defaults to registry.npmjs.org; override with
// FLYTO_NPM_URL for Verdaccio / Nexus / Artifactory proxies.
func NPMRegistry() string {
	return envOr("FLYTO_NPM_URL", "https://registry.npmjs.org")
}
