package endpoints

import (
	"testing"
)

// TestDefaults_PublicSaaS — when no override env is set, every getter
// returns the public-internet endpoint the cloud-saas build relies on.
// If a default flips silently we want CI to scream — the on-prem build
// hides under env overrides and a wrong default breaks SaaS only.
func TestDefaults_PublicSaaS(t *testing.T) {
	cases := []struct {
		name string
		fn   func() string
		want string
		env  string
	}{
		{"GitHubAPI", GitHubAPI, "https://api.github.com", "FLYTO_GITHUB_API_URL"},
		{"OSVAPI", OSVAPI, "https://api.osv.dev", "FLYTO_OSV_API_URL"},
		{"PyPIJSON", PyPIJSON, "https://pypi.org/pypi", "FLYTO_PYPI_URL"},
		{"NPMRegistry", NPMRegistry, "https://registry.npmjs.org", "FLYTO_NPM_URL"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(tc.env, "")
			if got := tc.fn(); got != tc.want {
				t.Errorf("%s default = %q, want %q", tc.name, got, tc.want)
			}
		})
	}
}

// TestOverride_TrimsTrailingSlash — operators routinely paste URLs with
// a trailing slash; the call sites concatenate path segments and end up
// with "//api/...". Trim once at the boundary so callers stay simple.
func TestOverride_TrimsTrailingSlash(t *testing.T) {
	t.Setenv("FLYTO_GITHUB_API_URL", "https://github.mycorp.com/api/v3/")
	if got, want := GitHubAPI(), "https://github.mycorp.com/api/v3"; got != want {
		t.Errorf("GitHubAPI = %q, want %q (no trailing slash)", got, want)
	}
}

// TestOverride_TrimsWhitespace — env vars copied from a wiki sometimes
// arrive with surrounding whitespace (esp. tab from shell heredocs).
// Treat blank-after-trim same as unset so the default kicks in.
func TestOverride_TrimsWhitespace(t *testing.T) {
	t.Setenv("FLYTO_OSV_API_URL", "  https://osv.internal  ")
	if got, want := OSVAPI(), "https://osv.internal"; got != want {
		t.Errorf("OSVAPI = %q, want %q (whitespace trimmed)", got, want)
	}
}

// TestEmptyEnv_FallsBackToDefault — explicit empty env (vs unset)
// must NOT poison the URL. Cloud Run picks this up from yaml where
// `value: ""` is common after a deletion.
func TestEmptyEnv_FallsBackToDefault(t *testing.T) {
	t.Setenv("FLYTO_NPM_URL", "")
	if got, want := NPMRegistry(), "https://registry.npmjs.org"; got != want {
		t.Errorf("NPMRegistry = %q, want default %q", got, want)
	}
}

// TestWhitespaceOnly_FallsBackToDefault — same as above but with
// non-empty whitespace string.
func TestWhitespaceOnly_FallsBackToDefault(t *testing.T) {
	t.Setenv("FLYTO_PYPI_URL", "   ")
	if got, want := PyPIJSON(), "https://pypi.org/pypi"; got != want {
		t.Errorf("PyPIJSON = %q, want default %q", got, want)
	}
}

// TestEnterpriseOverride_AcceptedVerbatim — full GitHub Enterprise
// path (with /api/v3 suffix) round-trips unchanged. Real on-prem
// configuration sample.
func TestEnterpriseOverride_AcceptedVerbatim(t *testing.T) {
	t.Setenv("FLYTO_GITHUB_API_URL", "https://github.mycorp.com/api/v3")
	if got, want := GitHubAPI(), "https://github.mycorp.com/api/v3"; got != want {
		t.Errorf("GitHubAPI = %q, want %q", got, want)
	}
}
