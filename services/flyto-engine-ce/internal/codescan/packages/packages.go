// Package packages — PR-2C Code-surface package extraction.
//
// Group P / Lane B. Pure, dependency-free derivation of canonical
// `package` and `package_version` identities from a code scan result's
// profile JSON (`code_scan_results.Data`, category=profile). This is
// the material the Code surface needs before it can dedupe findings
// across repos ("which repos depend on the CVE-affected lodash@4.17.20")
// and before P5's cross-surface graph can anchor CVE findings on a
// shared `package_version` node.
//
// What this package is:
//   - Extract(profileData) — parse the scan profile's dependency list
//     into canonical Package rows, deduped by canonical version id.
//   - Canonicalize(ecosystem, name, version) — the per-ecosystem
//     canonicalisation rules from docs/CODE_SURFACE_PLAN.md
//     ("Ecosystem-specific canonical rules"). Two semantically-equal
//     inputs MUST produce identical canonical ids; an unrecognised
//     ecosystem is skipped (never silently flattened).
//
// What this package is NOT:
//   - It does not touch the store, the kernel, or any relationship
//     table. It is a pure function so it is trivially testable with one
//     fixture per ecosystem. The kernel writer (WriteEntity for the
//     package / package_version resources + the `is_version_of` and
//     `repo depends_on` edges) is a separate step that consumes these
//     rows.
//   - It does not handle `ecosystem=docker`. Container/base-image
//     dependencies are the Container surface's identity (Group R /
//     PR-3A), not a Code `package`. Docker rows are skipped here so the
//     Code path never mints a container identity.
package packages

// Package is one canonical dependency derived from a scan profile.
// Name/Version are the raw scanned values (kept for display + audit);
// the Canonical* fields are the dedupe keys that become
// kernel_resources.canonical_value.
type Package struct {
	// Ecosystem is the normalised ecosystem key ("npm", "pypi", "go",
	// "maven", "gem", "cargo", "nuget", "composer"). Normalised from the
	// raw scanner value via normalizeEcosystem (e.g. "PyPI" → "pypi").
	Ecosystem string

	// Name / Version are the raw scanned strings, preserved verbatim for
	// display and audit. Do NOT use these as dedupe keys — use the
	// Canonical* fields.
	Name    string
	Version string

	// CanonicalPackage is the `package` kernel identity:
	// "{ecosystem}/{canonical-name}" — e.g. "npm/lodash",
	// "pypi/zope-interface", "go/github.com/jackc/pgx/v5".
	CanonicalPackage string

	// CanonicalVersion is the `package_version` kernel identity:
	// "{CanonicalPackage}@{canonical-version}" — e.g.
	// "npm/lodash@4.17.20". version is part of identity
	// (lodash@4.17.20 ≠ lodash@4.17.21).
	CanonicalVersion string
}

// SkippedDep records a dependency the extractor could not canonicalise:
// an unrecognised ecosystem, a docker/base-image row, or a row missing
// name/version. Surfaced so a backfill/worker can log a data-quality
// nudge instead of silently dropping rows.
type SkippedDep struct {
	Name      string
	Version   string
	Ecosystem string // raw ecosystem string as scanned
	Reason    string // why it was skipped
}

// ExtractResult is the output of Extract: canonical packages (deduped)
// plus the rows that were skipped and why.
type ExtractResult struct {
	// Packages are unique by CanonicalVersion, in first-seen order.
	Packages []Package
	// Skipped rows are not errors — they are dependencies outside the
	// canonical-identity contract (unknown ecosystem, docker, or
	// incomplete). Count them; don't fail on them.
	Skipped []SkippedDep
}
