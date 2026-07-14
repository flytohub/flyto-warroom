package osvutil

import (
	"regexp"
	"strconv"
	"strings"
)

var semverPrefixRE = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)`)

// Event is the subset of OSV range events needed to choose a fixed version.
type Event struct {
	Introduced string
	Fixed      string
}

type parsedVersion struct {
	major int
	minor int
	patch int
}

func parseSemver(v string) (parsedVersion, bool) {
	v = strings.TrimSpace(v)
	v = strings.TrimLeft(v, "^~>=<! ")
	m := semverPrefixRE.FindStringSubmatch(v)
	if m == nil {
		return parsedVersion{}, false
	}
	major, _ := strconv.Atoi(m[1])
	minor, _ := strconv.Atoi(m[2])
	patch, _ := strconv.Atoi(m[3])
	return parsedVersion{major: major, minor: minor, patch: patch}, true
}

// CompareSemver compares leading MAJOR.MINOR.PATCH versions.
// It returns ok=false when either input is not parseable.
func CompareSemver(a, b string) (cmp int, ok bool) {
	av, okA := parseSemver(a)
	bv, okB := parseSemver(b)
	if !okA || !okB {
		return 0, false
	}
	if av.major != bv.major {
		if av.major > bv.major {
			return 1, true
		}
		return -1, true
	}
	if av.minor != bv.minor {
		if av.minor > bv.minor {
			return 1, true
		}
		return -1, true
	}
	if av.patch != bv.patch {
		if av.patch > bv.patch {
			return 1, true
		}
		return -1, true
	}
	return 0, true
}

// SafeBumpTarget reports whether AutoFix may bump current to fixed without
// crossing a likely breaking line. For 0.x semver, the minor version is treated
// as the compatibility line because 0.y+1 can be breaking.
func SafeBumpTarget(current, fixed string) bool {
	cv, okC := parseSemver(current)
	fv, okF := parseSemver(fixed)
	if !okC || !okF {
		return false
	}
	if fv.major != cv.major {
		return false
	}
	if cv.major == 0 && fv.minor != cv.minor {
		return false
	}
	cmp, ok := CompareSemver(fixed, current)
	return ok && cmp > 0
}

// SelectFixedVersion returns the OSV fixed version that applies to current.
// OSV records can carry multiple introduced/fixed ranges for the same package;
// the first fixed event in the document is not necessarily the one that fixes
// the queried version.
func SelectFixedVersion(current string, ranges [][]Event) string {
	fallback := firstFixed(ranges)
	if strings.TrimSpace(current) == "" {
		return fallback
	}
	for _, events := range ranges {
		if fixed := fixedForRange(current, events); fixed != "" {
			return fixed
		}
	}
	return fallback
}

func firstFixed(ranges [][]Event) string {
	for _, events := range ranges {
		for _, e := range events {
			if strings.TrimSpace(e.Fixed) != "" {
				return e.Fixed
			}
		}
	}
	return ""
}

func fixedForRange(current string, events []Event) string {
	active := false
	seenIntroduced := false
	for _, e := range events {
		if strings.TrimSpace(e.Introduced) != "" {
			seenIntroduced = true
			if strings.TrimSpace(e.Introduced) == "0" {
				active = true
			} else if cmp, ok := CompareSemver(current, e.Introduced); ok {
				active = cmp >= 0
			} else {
				active = false
			}
		}
		if strings.TrimSpace(e.Fixed) == "" {
			continue
		}
		if active || !seenIntroduced {
			if cmp, ok := CompareSemver(current, e.Fixed); ok && cmp < 0 {
				return e.Fixed
			}
		}
		active = false
	}
	return ""
}
