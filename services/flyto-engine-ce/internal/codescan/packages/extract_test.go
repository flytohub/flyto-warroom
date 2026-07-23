package packages

import (
	"strings"
	"testing"
)

// realistic nested profile shape: dependencies.dependencies[] with
// {name, version, pinned_version, ecosystem} — mirrors what the indexer
// emits and what api.extractDepsFromProfile reads.
const sampleProfile = `{
  "project_type": "rest_api",
  "dependencies": {
    "dependencies": [
      {"name": "Lodash", "version": "4.17.20", "ecosystem": "npm"},
      {"name": "lodash", "version": "4.17.20", "ecosystem": "npm"},
      {"name": "requests", "version": "2.0.0", "pinned_version": "2.31.0", "ecosystem": "PyPI"},
      {"name": "zope.interface", "version": "5.4.0", "ecosystem": "pip"},
      {"name": "python", "version": "3.12-slim", "ecosystem": "docker"},
      {"name": "fmt", "version": "10.1.1", "ecosystem": "conan"},
      {"name": "", "version": "1.0.0", "ecosystem": "npm"}
    ]
  }
}`

func findPkg(pkgs []Package, canonVer string) *Package {
	for i := range pkgs {
		if pkgs[i].CanonicalVersion == canonVer {
			return &pkgs[i]
		}
	}
	return nil
}

func TestExtract_NestedProfile(t *testing.T) {
	res, err := Extract(sampleProfile)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	// lodash dedupes (Lodash + lodash → 1); requests + zope.interface
	// → 3 canonical packages total.
	if len(res.Packages) != 3 {
		t.Fatalf("Packages: got %d, want 3 (%+v)", len(res.Packages), res.Packages)
	}

	if findPkg(res.Packages, "npm/lodash@4.17.20") == nil {
		t.Error("missing npm/lodash@4.17.20")
	}
	// pinned_version (2.31.0) must win over version (2.0.0).
	if findPkg(res.Packages, "pypi/requests@2.31.0") == nil {
		t.Error("missing pypi/requests@2.31.0 (pinned_version should win)")
	}
	if findPkg(res.Packages, "pypi/zope-interface@5.4.0") == nil {
		t.Error("missing pypi/zope-interface@5.4.0 (PEP 503)")
	}

	// raw Name/Version preserved on the first-seen lodash row.
	if p := findPkg(res.Packages, "npm/lodash@4.17.20"); p != nil {
		if p.Name != "Lodash" {
			t.Errorf("raw Name: got %q, want %q (first-seen preserved)", p.Name, "Lodash")
		}
		if p.Ecosystem != "npm" {
			t.Errorf("normalised Ecosystem: got %q, want npm", p.Ecosystem)
		}
	}

	// docker + conan + empty-name → 3 skipped.
	if len(res.Skipped) != 3 {
		t.Fatalf("Skipped: got %d, want 3 (%+v)", len(res.Skipped), res.Skipped)
	}
	var dockerSkipped bool
	for _, s := range res.Skipped {
		if s.Ecosystem == "docker" {
			dockerSkipped = true
			if !strings.Contains(s.Reason, "container") {
				t.Errorf("docker skip reason should mention container surface, got %q", s.Reason)
			}
		}
	}
	if !dockerSkipped {
		t.Error("docker dependency was not recorded as skipped")
	}
}

func TestExtract_FlatDependencyArray(t *testing.T) {
	// Defensive: some shapes put the array directly under "dependencies".
	const flat = `{"dependencies":[{"name":"rails","version":"7.1.2","ecosystem":"gem"}]}`
	res, err := Extract(flat)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	if len(res.Packages) != 1 || res.Packages[0].CanonicalVersion != "gem/rails@7.1.2" {
		t.Fatalf("flat form: got %+v, want one gem/rails@7.1.2", res.Packages)
	}
}

func TestExtract_EmptyAndMalformed(t *testing.T) {
	// Well-formed, no deps → empty non-nil result, no error.
	res, err := Extract(`{"project_type":"library"}`)
	if err != nil {
		t.Fatalf("no-deps: unexpected error %v", err)
	}
	if res == nil || len(res.Packages) != 0 || len(res.Skipped) != 0 {
		t.Errorf("no-deps: want empty result, got %+v", res)
	}

	// Malformed JSON → error.
	if _, err := Extract(`{not json`); err == nil {
		t.Error("malformed JSON should return an error")
	}
}

func TestExtract_Idempotent(t *testing.T) {
	// Same input twice → identical canonical-version sets, same order.
	a, _ := Extract(sampleProfile)
	b, _ := Extract(sampleProfile)
	if len(a.Packages) != len(b.Packages) {
		t.Fatalf("non-deterministic count: %d vs %d", len(a.Packages), len(b.Packages))
	}
	for i := range a.Packages {
		if a.Packages[i].CanonicalVersion != b.Packages[i].CanonicalVersion {
			t.Errorf("order/identity drift at %d: %q vs %q", i, a.Packages[i].CanonicalVersion, b.Packages[i].CanonicalVersion)
		}
	}
}
