package packages

import (
	"encoding/json"
	"strings"
)

// Extract derives canonical packages from a code scan result's profile
// JSON (`code_scan_results.Data`, category=profile).
//
// It reads the same dependency list the rest of the engine reads
// (`api.extractDepsFromProfile`): top-level `dependencies` is an object
// whose `dependencies` field is the array of
// `{name, version, pinned_version, ecosystem}` rows. `pinned_version`
// wins over `version` (it's the resolved/locked value). For resilience
// against shape drift it also accepts `dependencies` being the array
// directly.
//
// Each row is canonicalised (Canonicalize). Rows that canonicalise are
// deduped by CanonicalVersion in first-seen order; rows that don't
// (unknown ecosystem, docker, missing fields) are recorded in Skipped.
// Idempotent and order-stable: the same Data always yields the same
// result, which is what lets the downstream kernel writer be
// canonical-value-keyed and re-scan-safe.
//
// A malformed JSON blob returns (nil, error). A well-formed blob with no
// dependency list returns an empty, non-nil result (not an error) — a
// repo with no scanned deps is normal, not a failure.
func Extract(profileData string) (*ExtractResult, error) {
	var raw map[string]any
	if err := json.Unmarshal([]byte(profileData), &raw); err != nil {
		return nil, err
	}

	depList := dependencyList(raw)
	res := &ExtractResult{}
	seen := make(map[string]struct{}, len(depList))

	for _, d := range depList {
		dm, ok := d.(map[string]any)
		if !ok {
			continue
		}
		name, _ := dm["name"].(string)
		version, _ := dm["version"].(string)
		pinned, _ := dm["pinned_version"].(string)
		ecosystem, _ := dm["ecosystem"].(string)

		ver := pinned
		if strings.TrimSpace(ver) == "" {
			ver = version
		}

		normEco, canonPkg, canonVer, ok := Canonicalize(ecosystem, name, ver)
		if !ok {
			res.Skipped = append(res.Skipped, SkippedDep{
				Name:      name,
				Version:   ver,
				Ecosystem: ecosystem,
				Reason:    skipReason(normEco, name, ver),
			})
			continue
		}
		if _, dup := seen[canonVer]; dup {
			continue
		}
		seen[canonVer] = struct{}{}
		res.Packages = append(res.Packages, Package{
			Ecosystem:        normEco,
			Name:             strings.TrimSpace(name),
			Version:          strings.TrimSpace(ver),
			CanonicalPackage: canonPkg,
			CanonicalVersion: canonVer,
		})
	}
	return res, nil
}

// dependencyList resolves the dependency array from either the nested
// object form (`dependencies.dependencies[]`, the indexer's shape) or
// the flat form (`dependencies` is itself the array).
func dependencyList(raw map[string]any) []any {
	switch deps := raw["dependencies"].(type) {
	case map[string]any:
		if inner, ok := deps["dependencies"].([]any); ok {
			return inner
		}
	case []any:
		return deps
	}
	return nil
}

// skipReason classifies why a row was skipped, for operator-facing logs.
func skipReason(normEco, name, version string) string {
	switch {
	case normEco == "":
		return "unrecognised or non-code ecosystem (e.g. docker → container surface)"
	case strings.TrimSpace(name) == "":
		return "missing package name"
	case strings.TrimSpace(version) == "":
		return "missing version"
	default:
		return "not canonicalisable"
	}
}
