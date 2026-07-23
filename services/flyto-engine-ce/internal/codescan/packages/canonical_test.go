package packages

import "testing"

// TestCanonicalize_PerEcosystem pins the canonical id for one fixture
// per ecosystem in the CODE_SURFACE_PLAN table. Renaming a rule without
// updating its fixture = silent identity drift across the kernel.
func TestCanonicalize_PerEcosystem(t *testing.T) {
	tests := []struct {
		name    string
		eco     string
		pkg     string
		ver     string
		wantEco string
		wantPkg string
		wantVer string
	}{
		{"npm scoped, mixed case", "npm", "@types/Node", "20.5.0", "npm", "npm/@types/node", "npm/@types/node@20.5.0"},
		{"npm unscoped", "npm", "Lodash", "4.17.20", "npm", "npm/lodash", "npm/lodash@4.17.20"},
		{"pypi PEP503 dot→dash", "PyPI", "zope.interface", "5.4.0", "pypi", "pypi/zope-interface", "pypi/zope-interface@5.4.0"},
		{"maven group:artifact", "maven", "com.fasterxml.jackson.core:jackson-databind", "2.16.0", "maven", "maven/com.fasterxml.jackson.core:jackson-databind", "maven/com.fasterxml.jackson.core:jackson-databind@2.16.0"},
		{"go module verbatim", "go", "github.com/jackc/pgx/v5", "v5.5.1", "go", "go/github.com/jackc/pgx/v5", "go/github.com/jackc/pgx/v5@v5.5.1"},
		{"gem lowercased", "gem", "Rails", "7.1.2", "gem", "gem/rails", "gem/rails@7.1.2"},
		{"cargo lowercased keep-hyphen", "cargo", "Serde-JSON", "1.0.108", "cargo", "cargo/serde-json", "cargo/serde-json@1.0.108"},
		{"nuget lowercased", "nuget", "Newtonsoft.Json", "13.0.3", "nuget", "nuget/newtonsoft.json", "nuget/newtonsoft.json@13.0.3"},
		{"nuget trailing-zero trim", "nuget", "Newtonsoft.Json", "13.0.0.0", "nuget", "nuget/newtonsoft.json", "nuget/newtonsoft.json@13.0.0"},
		{"composer vendor/name", "composer", "Symfony/Console", "6.4.0", "composer", "composer/symfony/console", "composer/symfony/console@6.4.0"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			eco, pkg, ver, ok := Canonicalize(tc.eco, tc.pkg, tc.ver)
			if !ok {
				t.Fatalf("Canonicalize ok=false, want true")
			}
			if eco != tc.wantEco {
				t.Errorf("eco: got %q, want %q", eco, tc.wantEco)
			}
			if pkg != tc.wantPkg {
				t.Errorf("canonPkg: got %q, want %q", pkg, tc.wantPkg)
			}
			if ver != tc.wantVer {
				t.Errorf("canonVer: got %q, want %q", ver, tc.wantVer)
			}
		})
	}
}

// TestCanonicalize_DedupProperty — semantically-equal inputs MUST
// collapse to one id (the regression guard for "Requests==requests"),
// and genuinely-distinct inputs MUST NOT.
func TestCanonicalize_DedupProperty(t *testing.T) {
	sameVer := func(t *testing.T, label string, a, b [3]string) {
		t.Helper()
		_, _, va, oka := Canonicalize(a[0], a[1], a[2])
		_, _, vb, okb := Canonicalize(b[0], b[1], b[2])
		if !oka || !okb {
			t.Fatalf("%s: expected both canonicalisable, got ok=%v,%v", label, oka, okb)
		}
		if va != vb {
			t.Errorf("%s: expected SAME id, got %q vs %q", label, va, vb)
		}
	}
	diffVer := func(t *testing.T, label string, a, b [3]string) {
		t.Helper()
		_, _, va, _ := Canonicalize(a[0], a[1], a[2])
		_, _, vb, _ := Canonicalize(b[0], b[1], b[2])
		if va == vb {
			t.Errorf("%s: expected DIFFERENT ids, both were %q", label, va)
		}
	}

	// pypi: case + separator variants collapse (PEP 503).
	sameVer(t, "pypi case/sep", [3]string{"PyPI", "Zope.Interface", "5.4.0"}, [3]string{"pip", "zope_interface", "5.4.0"})
	// npm: case collapses; ecosystem alias collapses.
	sameVer(t, "npm case+alias", [3]string{"npm", "Lodash", "4.17.20"}, [3]string{"node", "lodash", "4.17.20"})
	// pypi ecosystem aliases all map to pypi.
	sameVer(t, "pypi eco alias", [3]string{"pyproject", "requests", "2.31.0"}, [3]string{"poetry", "requests", "2.31.0"})

	// cargo: '-' and '_' are DISTINCT crates — must NOT collapse.
	diffVer(t, "cargo hyphen vs underscore", [3]string{"cargo", "serde-json", "1.0.108"}, [3]string{"cargo", "serde_json", "1.0.108"})
	// version is part of identity.
	diffVer(t, "npm version differs", [3]string{"npm", "lodash", "4.17.20"}, [3]string{"npm", "lodash", "4.17.21"})
	// go is case-sensitive — different case = different module.
	diffVer(t, "go case-sensitive", [3]string{"go", "github.com/BurntSushi/toml", "v1.3.2"}, [3]string{"go", "github.com/burntsushi/toml", "v1.3.2"})
}

// TestCanonicalize_PypiPEP440Version pins the PEP 440 version canonical
// form (the Codex Needs-fix on 318a49e). Exact-form table: each raw
// PyPI version must canonicalise to the stated string so the kernel
// writer freezes one identity per release.
func TestCanonicalize_PypiPEP440Version(t *testing.T) {
	cases := []struct {
		raw  string
		want string // expected canonical version (the part after '@')
	}{
		// prerelease spelling + separator variants
		{"1.0.0-alpha1", "1.0.0a1"},
		{"1.0.0a1", "1.0.0a1"},
		{"1.0.0.alpha.1", "1.0.0a1"},
		{"1.0.0-a-1", "1.0.0a1"},
		{"1.0b2", "1.0b2"},
		{"1.0-beta2", "1.0b2"},
		{"1.0rc1", "1.0rc1"},
		{"1.0-c1", "1.0rc1"},
		{"1.0pre1", "1.0rc1"},
		{"1.0preview1", "1.0rc1"},
		{"1.0a", "1.0a0"}, // implicit prerelease number
		// post-release forms
		{"1.0-1", "1.0.post1"},
		{"1.0.post1", "1.0.post1"},
		{"1.0post1", "1.0.post1"},
		{"1.0rev1", "1.0.post1"},
		{"1.0r1", "1.0.post1"},
		// dev forms
		{"1.0dev", "1.0.dev0"},
		{"1.0.dev0", "1.0.dev0"},
		// v-prefix, leading zeros, epoch
		{"v1.0.0", "1.0.0"},
		{"01.0.0", "1.0.0"},
		{"1.0.0", "1.0.0"},
		{"1!2.0", "1!2.0"},
		{"0!1.0", "1.0"}, // zero epoch dropped
		// combined + local
		{"1.0.0-alpha1.post2.dev3", "1.0.0a1.post2.dev3"},
		{"1.0+Local_Build", "1.0+local.build"},
	}
	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			_, _, canonVer, ok := Canonicalize("PyPI", "foo", tc.raw)
			if !ok {
				t.Fatalf("Canonicalize ok=false for %q", tc.raw)
			}
			want := "pypi/foo@" + tc.want
			if canonVer != want {
				t.Errorf("got %q, want %q", canonVer, want)
			}
		})
	}
}

// TestCanonicalize_PypiVersionCollapse proves whole groups of equivalent
// spellings land on ONE CanonicalVersion (the dedupe contract).
func TestCanonicalize_PypiVersionCollapse(t *testing.T) {
	groups := [][]string{
		{"1.0.0-alpha1", "1.0.0a1", "1.0.0.alpha.1", "1.0.0-a-1"},
		{"1.0rc1", "1.0-c1", "1.0pre1", "1.0preview1", "1.0-rc-1"},
		{"1.0-1", "1.0.post1", "1.0post1", "1.0rev1", "1.0r1", "1.0-post-1"},
		{"v1.0.0", "1.0.0", "01.0.0", "0!1.0.0"},
	}
	for gi, g := range groups {
		var first string
		for i, raw := range g {
			_, _, cv, ok := Canonicalize("pypi", "pkg", raw)
			if !ok {
				t.Fatalf("group %d: %q not canonicalisable", gi, raw)
			}
			if i == 0 {
				first = cv
				continue
			}
			if cv != first {
				t.Errorf("group %d: %q → %q, expected to collapse to %q", gi, raw, cv, first)
			}
		}
	}
}

// TestCanonicalize_SkipsNonCodeAndUnknown — docker (container surface),
// unrecognised ecosystems, and incomplete rows must return ok=false so
// the extractor records them as Skipped instead of minting kernel rows.
func TestCanonicalize_SkipsNonCodeAndUnknown(t *testing.T) {
	cases := []struct {
		name          string
		eco, pkg, ver string
	}{
		{"docker is container surface", "docker", "python", "3.12-slim"},
		{"unknown ecosystem", "conan", "fmt", "10.1.1"},
		{"empty name", "npm", "", "1.0.0"},
		{"empty version", "npm", "lodash", ""},
		{"empty ecosystem", "", "lodash", "1.0.0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, pkg, ver, ok := Canonicalize(tc.eco, tc.pkg, tc.ver)
			if ok {
				t.Errorf("expected ok=false, got ok=true (pkg=%q ver=%q)", pkg, ver)
			}
			if pkg != "" || ver != "" {
				t.Errorf("expected empty ids on skip, got pkg=%q ver=%q", pkg, ver)
			}
		})
	}
}
