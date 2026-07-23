package packages

import (
	"regexp"
	"strings"
)

// Canonicalize applies the per-ecosystem canonicalisation rules from
// docs/CODE_SURFACE_PLAN.md ("Ecosystem-specific canonical rules") to a
// single (ecosystem, name, version) tuple.
//
// Returns:
//   - normEco: the normalised ecosystem key (e.g. "PyPI" → "pypi").
//   - canonPkg: "{normEco}/{canonical-name}" — the `package` identity.
//   - canonVer: "{canonPkg}@{canonical-version}" — the `package_version`
//     identity.
//   - ok=false when the ecosystem is unrecognised (or docker), or when
//     name/version is empty after normalisation. Callers MUST skip +
//     record an !ok row rather than fabricate a flat fallback id —
//     silent fallbacks would let unaudited ecosystems pollute the kernel.
//
// Contract: two semantically-equal inputs (e.g. "Requests" vs
// "requests", "zope.interface" vs "zope-interface") MUST produce the
// same canonPkg/canonVer. That dedupe property is pinned per-ecosystem
// in canonical_test.go.
//
// Note on file layout: CODE_SURFACE_PLAN suggests one file per
// ecosystem (canonical_npm.go, …) for reviewability. They are colocated
// here as clearly-separated functions for the initial drop; splitting
// per-file later is a mechanical no-op if review prefers it.
func Canonicalize(ecosystem, name, version string) (normEco, canonPkg, canonVer string, ok bool) {
	normEco = normalizeEcosystem(ecosystem)
	name = strings.TrimSpace(name)
	version = strings.TrimSpace(version)
	if normEco == "" || name == "" || version == "" {
		return normEco, "", "", false
	}

	var canonName, canonVersion string
	switch normEco {
	case "npm":
		canonName, canonVersion = canonNpm(name, version)
	case "pypi":
		canonName, canonVersion = canonPypi(name, version)
	case "maven":
		canonName, canonVersion = canonMaven(name, version)
	case "go":
		canonName, canonVersion = canonGo(name, version)
	case "gem":
		canonName, canonVersion = canonGem(name, version)
	case "cargo":
		canonName, canonVersion = canonCargo(name, version)
	case "nuget":
		canonName, canonVersion = canonNuget(name, version)
	case "composer":
		canonName, canonVersion = canonComposer(name, version)
	default:
		// Unrecognised ecosystem (includes "docker", handled by
		// normalizeEcosystem returning ""). Caller skips + logs.
		return normEco, "", "", false
	}

	if canonName == "" || canonVersion == "" {
		return normEco, "", "", false
	}
	canonPkg = normEco + "/" + canonName
	canonVer = canonPkg + "@" + canonVersion
	return normEco, canonPkg, canonVer, true
}

// normalizeEcosystem maps the varied raw ecosystem strings the scanner
// emits ("PyPI", "pip", "pyproject", "Go", …) onto a single canonical
// key. Returns "" for ecosystems with no canonical-identity rule yet,
// AND for "docker" — docker/base-image deps are the Container surface's
// identity (Group R / PR-3A), never a Code `package`. Adding a new
// ecosystem means: add a case here AND a canon<Eco> function AND a
// fixture in canonical_test.go. Never widen the default to a flat
// fallback.
func normalizeEcosystem(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "npm", "node", "nodejs":
		return "npm"
	case "pypi", "pip", "pyproject", "python", "poetry":
		return "pypi"
	case "maven", "gradle", "java":
		return "maven"
	case "go", "gomod", "golang":
		return "go"
	case "gem", "rubygems", "ruby":
		return "gem"
	case "cargo", "crates", "crates.io", "rust":
		return "cargo"
	case "nuget", "dotnet", ".net":
		return "nuget"
	case "composer", "packagist", "php":
		return "composer"
	default:
		// "docker" and anything else falls through unrecognised. Docker
		// is intentionally NOT mapped: container images are Container
		// surface identity, not Code packages.
		return ""
	}
}

// canonNpm — preserve @scope/; lowercase the whole name (npm names are
// case-insensitive and the registry lowercases). Version is exact
// semver, NOT lowercased: semver §10 pre-release identifiers are
// case-sensitive.
//
//	("@types/Node", "20.5.0") → "@types/node", "20.5.0"
//	("Lodash", "4.17.20")     → "lodash", "4.17.20"
func canonNpm(name, version string) (string, string) {
	return strings.ToLower(name), version
}

// canonPypi — PEP 503 name normalisation + PEP 440 version
// normalisation. Name: lowercase, collapse any run of "-", "_", "."
// into a single "-". Version: full PEP 440 canonical form (pep440),
// so prerelease/post/dev spelling + separator variants collapse to one
// identity before the kernel writer freezes it.
//
//	("zope.interface", "5.4.0")       → "zope-interface", "5.4.0"
//	("Flask_SQLAlchemy", "3.1")       → "flask-sqlalchemy", "3.1"
//	("requests", "2.0.0-alpha1")      → "requests", "2.0.0a1"
func canonPypi(name, version string) (string, string) {
	return pep503(name), pep440(version)
}

// pep503 collapses runs of [-_.] to a single '-' and lowercases.
func pep503(name string) string {
	var b strings.Builder
	b.Grow(len(name))
	prevSep := false
	for _, r := range strings.ToLower(name) {
		if r == '-' || r == '_' || r == '.' {
			if !prevSep {
				b.WriteByte('-')
				prevSep = true
			}
			continue
		}
		b.WriteRune(r)
		prevSep = false
	}
	return strings.Trim(b.String(), "-")
}

// pep440Re parses a PEP 440 version into its components. Mirrors the
// official PEP 440 grammar (epoch / release / pre / post / dev / local),
// case-insensitive with a leading "v" allowed. Capturing groups:
//
//	1 epoch  2 release  3 pre-label  4 pre-num
//	5 implicit-post-num (the "-N" form)  6 post-label  7 post-num
//	8 dev-label  9 dev-num  10 local
var pep440Re = regexp.MustCompile(
	`^v?(?:(\d+)!)?(\d+(?:\.\d+)*)` +
		`(?:[-_.]?(a|b|c|rc|alpha|beta|pre|preview)[-_.]?(\d+)?)?` +
		`(?:(?:-(\d+))|(?:[-_.]?(post|rev|r)[-_.]?(\d+)?))?` +
		`(?:[-_.]?(dev)[-_.]?(\d+)?)?` +
		`(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?$`,
)

// pep440 returns the PEP 440 canonical form of a version so that
// semantically-equal spellings collapse to ONE kernel identity:
//
//	"1.0.0-alpha1" / "1.0.0a1" / "1.0.0.alpha.1" → "1.0.0a1"
//	"1.0b2" / "1.0-beta2"                         → "1.0b2"
//	"1.0rc1" / "1.0-c1" / "1.0pre1" / "1.0preview1" → "1.0rc1"
//	"1.0-1" / "1.0.post1"                         → "1.0.post1"
//	"1.0dev" / "1.0.dev0"                         → "1.0.dev0"
//	"v1.0.0" / "01.0.0"                           → "1.0.0"
//
// Normalisation applied: lowercase; drop leading "v"; strip a zero
// epoch and leading zeros in every numeric segment; canonical
// prerelease labels (alpha→a, beta→b, c/pre/preview→rc) with no
// separator and an implicit "0" number; post/rev/r and the implicit
// "-N" form → ".postN"; dev → ".devN"; local separators → ".".
//
// Inputs that aren't valid PEP 440 (git hashes, "latest", etc.) fall
// back to lowercased+trimmed — still deterministic, so dedupe holds.
func pep440(version string) string {
	s := strings.ToLower(strings.TrimSpace(version))
	m := pep440Re.FindStringSubmatch(s)
	if m == nil {
		return s
	}
	epoch, release := m[1], m[2]
	preL, preN := m[3], m[4]
	postImplicit, postL, postN := m[5], m[6], m[7]
	devL, devN := m[8], m[9]
	local := m[10]

	var b strings.Builder
	if epoch != "" {
		if e := stripZeros(epoch); e != "0" {
			b.WriteString(e)
			b.WriteByte('!')
		}
	}
	for i, p := range strings.Split(release, ".") {
		if i > 0 {
			b.WriteByte('.')
		}
		b.WriteString(stripZeros(p))
	}
	if preL != "" {
		b.WriteString(normalizePreLabel(preL))
		b.WriteString(stripZeros(orZero(preN)))
	}
	switch {
	case postImplicit != "":
		b.WriteString(".post")
		b.WriteString(stripZeros(postImplicit))
	case postL != "":
		b.WriteString(".post")
		b.WriteString(stripZeros(orZero(postN)))
	}
	if devL != "" {
		b.WriteString(".dev")
		b.WriteString(stripZeros(orZero(devN)))
	}
	if local != "" {
		b.WriteByte('+')
		b.WriteString(strings.NewReplacer("-", ".", "_", ".").Replace(local))
	}
	return b.String()
}

// normalizePreLabel maps PEP 440 prerelease spellings to canonical form.
func normalizePreLabel(l string) string {
	switch l {
	case "alpha", "a":
		return "a"
	case "beta", "b":
		return "b"
	case "c", "pre", "preview", "rc":
		return "rc"
	}
	return l
}

// stripZeros removes leading zeros from a numeric segment, keeping a
// single "0" when the segment is all zeros.
func stripZeros(s string) string {
	t := strings.TrimLeft(s, "0")
	if t == "" {
		return "0"
	}
	return t
}

// orZero returns "0" for an empty implicit number (e.g. "1.0a" → a0).
func orZero(n string) string {
	if n == "" {
		return "0"
	}
	return n
}

// canonMaven — "{groupId}:{artifactId}" lowercased (Maven Central is
// case-insensitive). Classifier/packaging, if the scanner appended any,
// ride along lowercased. Version exact (SNAPSHOT timestamps preserved).
//
//	("com.fasterxml.jackson.core:jackson-databind", "2.16.0")
//	  → "com.fasterxml.jackson.core:jackson-databind", "2.16.0"
func canonMaven(name, version string) (string, string) {
	return strings.ToLower(name), version
}

// canonGo — Go module paths ARE the canonical form and are
// case-sensitive; preserve verbatim. Version is the exact tag including
// the leading "v"; pseudo-versions kept whole.
//
//	("github.com/jackc/pgx/v5", "v5.5.1")
//	  → "github.com/jackc/pgx/v5", "v5.5.1"
func canonGo(name, version string) (string, string) {
	return name, version
}

// canonGem — RubyGems names lowercased; version exact.
func canonGem(name, version string) (string, string) {
	return strings.ToLower(name), version
}

// canonCargo — crate names lowercased, but hyphens NOT collapsed:
// cargo treats "foo-bar" and "foo_bar" as distinct crates. Version
// exact semver.
//
//	("Serde-JSON", "1.0.108") → "serde-json", "1.0.108"
func canonCargo(name, version string) (string, string) {
	return strings.ToLower(name), version
}

// canonNuget — NuGet IDs are case-insensitive → lowercase. Version is
// NuGet-normalised: trailing zero components beyond the first three are
// trimmed (1.0.0.0 → 1.0.0), preserving any pre-release suffix.
//
//	("Newtonsoft.Json", "13.0.3")     → "newtonsoft.json", "13.0.3"
//	("Newtonsoft.Json", "13.0.0.0")   → "newtonsoft.json", "13.0.0"
func canonNuget(name, version string) (string, string) {
	return strings.ToLower(name), nugetNormalizeVersion(version)
}

// nugetNormalizeVersion trims a 4th (and beyond) numeric component when
// it is zero, keeping a minimum of 3 components. The pre-release /
// build suffix (everything from the first '-' or '+') is preserved.
func nugetNormalizeVersion(version string) string {
	core := version
	suffix := ""
	if i := strings.IndexAny(version, "-+"); i >= 0 {
		core, suffix = version[:i], version[i:]
	}
	parts := strings.Split(core, ".")
	for len(parts) > 3 && parts[len(parts)-1] == "0" {
		parts = parts[:len(parts)-1]
	}
	return strings.Join(parts, ".") + suffix
}

// canonComposer — "{vendor}/{name}" lowercased; version exact.
//
//	("Symfony/Console", "6.4.0") → "symfony/console", "6.4.0"
func canonComposer(name, version string) (string, string) {
	return strings.ToLower(name), version
}
