// Package containerscan wraps the Trivy CLI to surface container
// image vulnerabilities. The engine spawns `trivy image --format json`
// per Dockerfile FROM directive discovered in a scanned repo and
// stores the results as ContainerFinding rows.
//
// Trivy is the broadest single-binary scanner (CVE + IaC + secrets +
// misconfig in one); this package only uses the image-CVE mode for
// now. The IaC + secret paths are handled by flyto-indexer + the
// existing scan_extras pipeline.
//
// Design choices:
//
//  1. Subprocess, not the Go SDK. The SDK pulls hundreds of MB of
//     transitive deps; we want a binary in the runtime image, not a
//     compile-time tax.
//  2. Optional. If trivy isn't on PATH, ScanImage logs a warn and
//     returns no error — the rest of the scan pipeline must keep
//     working in environments that haven't installed trivy yet
//     (desktop sidecar, dev containers without the binary baked in).
//  3. Bounded. Each call has a hard timeout so a hung trivy doesn't
//     strand the request goroutine. Concurrent calls are NOT
//     serialised here; the caller orchestrates fan-out.
package containerscan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Vulnerability is one CVE found inside a container image.
// Mirrors what api.ContainerFinding needs without dragging the
// store package into this package's import graph.
type Vulnerability struct {
	CVEID            string
	PackageName      string
	InstalledVersion string
	FixedVersion     string
	Severity         string // CRITICAL / HIGH / MEDIUM / LOW / UNKNOWN
	Title            string
	Description      string
	// PR-3D-2 — ecosystem provenance for cross-surface SBOM linkage.
	// PkgType is trivy's per-Result Type ("npm", "pypi", "debian", …);
	// PkgClass is the Result Class ("lang-pkgs" / "os-pkgs"). Carried
	// so the container scan can resolve a language package to its
	// Code-surface package_version kernel resource and emit a
	// container.contains_package edge. OS packages (Class="os-pkgs",
	// Type="debian"/"alpine"/…) are deliberately left for the linker
	// to skip — they are not Code packages. Empty for results trivy
	// emits without a Type/Class.
	PkgType  string
	PkgClass string

	// ── Exploitability signal (KEV / EPSS) ──
	// Populated by EnrichExploitability between ScanImage and
	// ContainerFinding row creation so the container scoring path can
	// weight an actively-exploited CVE heavier than a high-severity-but-
	// theoretical one (severity-count alone treats them identically).
	//
	//   InKEV       — CVE is on CISA's Known Exploited Vulnerabilities list.
	//   EPSS        — FIRST EPSS probability of exploitation (0.0-1.0).
	//   Exploitable — derived: InKEV || EPSS >= ExploitableEPSSThreshold.
	//
	// Zero-valued for the scan path until EnrichExploitability is called,
	// so existing callers are unaffected.
	InKEV       bool
	EPSS        float64
	Exploitable bool
}

// ExploitableEPSSThreshold is the EPSS score at or above which a CVE is
// treated as "exploit-likely" for container prioritisation. It mirrors
// vulnescalate.EPSSHighThreshold (0.50 — FIRST's documented high-exploit
// boundary, also used by internal/cve risk factoring). The constant is
// duplicated here, rather than imported, on purpose: containerscan is a
// low-level scanner package and importing internal/vulnescalate (or
// internal/cve) would invert the dependency direction and risk an import
// cycle. Keep this value in sync with vulnescalate.EPSSHighThreshold.
const ExploitableEPSSThreshold = 0.50

// EnrichExploitability stamps the KEV/EPSS exploitability signal onto each
// vulnerability in place. It mirrors cve.EnrichVulnerabilities but stays
// dependency-free: instead of importing internal/cve (which would invert
// the scanner→cve layering), the caller passes the KEV predicate and the
// EPSS map directly. The api scan path (api/scan_container.go) is expected
// to call this between ScanImage and ContainerFinding row creation, e.g.:
//
//	containerscan.EnrichExploitability(res.Vulnerabilities,
//	    s.KEVCache.Contains, epssByCVE)
//
// where epssByCVE is built from cve.FetchEPSS results (cveID → EPSS float).
//
// Pure and deterministic. Nil-safe: a nil inKEV predicate leaves InKEV
// false; a nil epss map leaves EPSS 0. Exploitable is recomputed as
// InKEV || EPSS >= ExploitableEPSSThreshold.
func EnrichExploitability(vulns []Vulnerability, inKEV func(cveID string) bool, epss map[string]float64) {
	for i := range vulns {
		v := &vulns[i]
		if inKEV != nil {
			v.InKEV = inKEV(v.CVEID)
		}
		if epss != nil {
			v.EPSS = epss[v.CVEID]
		}
		v.Exploitable = v.InKEV || v.EPSS >= ExploitableEPSSThreshold
	}
}

// Package is one SBOM entry — ANY package in the image, vulnerable or
// not — captured when trivy runs with --list-all-pkgs. Ecosystem is the
// per-Result Type ("npm"/"pypi"/"debian"/…); Class is "lang-pkgs" /
// "os-pkgs". Consumed by the container.contains_package SBOM edge so the
// edge reflects the image's full Code-surface package inventory, not just
// the CVE-bearing subset (PR-3D-2 round-2).
type Package struct {
	Ecosystem string
	Class     string
	Name      string
	Version   string
}

// ScanResult is the per-image output of one trivy invocation.
type ScanResult struct {
	ImageRef        string
	Vulnerabilities []Vulnerability
	// Packages is the full SBOM inventory (all packages, not just
	// vulnerable ones). Populated from --list-all-pkgs.
	Packages []Package

	// Image identity + intrinsic metadata parsed from trivy's Metadata
	// block. Best-effort: trivy on a pullable image fills
	// Digest/OS/Arch; an unpullable ref (private registry, deleted tag)
	// can leave them empty, in which case the caller skips kernel
	// projection for that image. Digest is the container_image kernel
	// identity; RepoTags/RepoDigests are provenance (container_image_tags).
	Digest      string   // Metadata.ImageID (sha256:...)
	OSFamily    string   // Metadata.OS.Family
	OSVersion   string   // Metadata.OS.Name
	Arch        string   // Metadata.ImageConfig.architecture
	RepoTags    []string // registry/repo:tag provenance
	RepoDigests []string // registry/repo@sha256:... provenance
	LayerCount  int      // len(diff_ids); 0 = unknown

	// SkippedBecauseUnavailable=true when trivy is not on PATH so the
	// caller can distinguish "no findings" from "scanner not present".
	SkippedBecauseUnavailable bool
}

// trivyJSON is the minimal subset of trivy's `--format json` output
// we read. Trivy publishes a wide schema; only Results[].Vulnerabilities[]
// is load-bearing for the war-room view.
type trivyJSON struct {
	Results []struct {
		Target string `json:"Target"`
		Class  string `json:"Class"`
		Type   string `json:"Type"`
		// Packages is the full per-result package list, populated by
		// --list-all-pkgs (PR-3D-2 round-2). Drives the SBOM edge.
		Packages []struct {
			Name    string `json:"Name"`
			Version string `json:"Version"`
		} `json:"Packages"`
		Vulnerabilities []struct {
			VulnerabilityID  string `json:"VulnerabilityID"`
			PkgName          string `json:"PkgName"`
			InstalledVersion string `json:"InstalledVersion"`
			FixedVersion     string `json:"FixedVersion"`
			Severity         string `json:"Severity"`
			Title            string `json:"Title"`
			Description      string `json:"Description"`
		} `json:"Vulnerabilities"`
	} `json:"Results"`
	Metadata struct {
		ImageID     string   `json:"ImageID"`
		DiffIDs     []string `json:"DiffIDs"`
		RepoTags    []string `json:"RepoTags"`
		RepoDigests []string `json:"RepoDigests"`
		OS          struct {
			Family string `json:"Family"`
			Name   string `json:"Name"`
		} `json:"OS"`
		ImageConfig struct {
			Architecture string `json:"architecture"`
			RootFS       struct {
				DiffIDs []string `json:"diff_ids"`
			} `json:"rootfs"`
		} `json:"ImageConfig"`
	} `json:"Metadata"`
}

// trivyTimeout is the hard ceiling on one image scan. Trivy is
// usually < 60s on a warm DB; first-run DB pulls can stretch to
// 3-5 minutes. 6 min keeps cold-start tolerable while still bounding
// runaways.
const trivyTimeout = 6 * time.Minute

// ScanImage runs `trivy image --format json` on the given ref. The
// optional cache directory persists trivy's vulnerability DB across
// invocations — pass an empty string to use trivy's default location
// inside the container.
func ScanImage(ctx context.Context, imageRef string, cacheDir string) (*ScanResult, error) {
	if strings.TrimSpace(imageRef) == "" {
		return nil, errors.New("empty image ref")
	}
	if _, err := exec.LookPath("trivy"); err != nil {
		// Not installed — graceful no-op. The caller logs at info
		// level so an operator looking at logs can tell the scanner
		// is just absent (vs. broken).
		return &ScanResult{ImageRef: imageRef, SkippedBecauseUnavailable: true}, nil
	}

	scanCtx, cancel := context.WithTimeout(ctx, trivyTimeout)
	defer cancel()

	args := []string{
		"image",
		"--format", "json",
		"--quiet",
		// Emit the full package inventory (not just vulnerable packages)
		// so the container.contains_package SBOM edge reflects the whole
		// image, not the CVE-bearing subset (PR-3D-2 round-2).
		"--list-all-pkgs",
		// Skip on missing image rather than failing the whole scan
		// — base images named in a Dockerfile may not be pullable
		// from the engine's network (private registry, deleted tag).
		"--exit-code", "0",
		// Don't fail when the DB is older than 24h; offline builds
		// still get usable output.
		"--skip-db-update=false",
	}
	if cacheDir != "" {
		args = append(args, "--cache-dir", cacheDir)
	}
	args = append(args, imageRef)

	cmd := exec.CommandContext(scanCtx, "trivy", args...)
	out, err := cmd.Output()
	if err != nil {
		// Trivy emits diagnostics on stderr; surface them to the
		// caller so log lines aren't a bare "exit status 1".
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			return nil, fmt.Errorf("trivy %s: %w (stderr: %s)", imageRef, err, strings.TrimSpace(string(ee.Stderr)))
		}
		return nil, fmt.Errorf("trivy %s: %w", imageRef, err)
	}

	var parsed trivyJSON
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, fmt.Errorf("trivy %s: parse json: %w", imageRef, err)
	}

	res := &ScanResult{ImageRef: imageRef}
	for _, r := range parsed.Results {
		for _, v := range r.Vulnerabilities {
			if v.VulnerabilityID == "" {
				continue
			}
			res.Vulnerabilities = append(res.Vulnerabilities, Vulnerability{
				CVEID:            v.VulnerabilityID,
				PackageName:      v.PkgName,
				InstalledVersion: v.InstalledVersion,
				FixedVersion:     v.FixedVersion,
				Severity:         strings.ToUpper(v.Severity),
				Title:            v.Title,
				Description:      v.Description,
				PkgType:          r.Type,
				PkgClass:         r.Class,
			})
		}
		// Full SBOM inventory (--list-all-pkgs). Every package the image
		// carries, vulnerable or not — the source for contains_package.
		for _, p := range r.Packages {
			if p.Name == "" || p.Version == "" {
				continue
			}
			res.Packages = append(res.Packages, Package{
				Ecosystem: r.Type,
				Class:     r.Class,
				Name:      p.Name,
				Version:   p.Version,
			})
		}
	}

	// Image identity + intrinsic metadata (best-effort).
	m := parsed.Metadata
	res.Digest = strings.TrimSpace(m.ImageID)
	res.OSFamily = m.OS.Family
	res.OSVersion = m.OS.Name
	res.Arch = m.ImageConfig.Architecture
	res.RepoTags = m.RepoTags
	res.RepoDigests = m.RepoDigests
	if n := len(m.DiffIDs); n > 0 {
		res.LayerCount = n
	} else {
		res.LayerCount = len(m.ImageConfig.RootFS.DiffIDs)
	}
	return res, nil
}

// Available returns true when the trivy binary can be invoked. Useful
// for handlers that want to short-circuit ("scanner not installed")
// instead of quietly producing empty results.
func Available() bool {
	_, err := exec.LookPath("trivy")
	return err == nil
}
