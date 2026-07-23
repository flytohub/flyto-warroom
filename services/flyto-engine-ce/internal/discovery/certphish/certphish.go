package certphish

// Package certphish — CT-log-driven phishing certificate detection.
//
// The existing internal/discovery/ctlog package discovers subdomains
// the ORG OWNS by querying crt.sh for `%.org-root`. This package
// flips the query: search crt.sh for any cert whose hostname
// CONTAINS the brand term, EXCLUDE the org's owned domains, and
// score each remaining cert as a phishing candidate.
//
// Rationale: a typosquat domain only becomes a real threat when
// someone issues a TLS cert for it (signals intent to host
// content). Brand-protection lookalike detection generates
// candidates from edit-distance pattern matching — many of those
// candidates never get certs, so they're noise. CT-log-driven
// detection inverts this: every hit IS a cert that was actually
// issued, dramatically lower false-positive rate.
//
// Honesty posture ([[no_overclaim_impersonation]]): we surface
// `suspicious_cert` as a CANDIDATE for operator review, not as
// confirmed phishing. The score guides triage order; the takedown
// flow still requires operator-supplied brand-rights proof.

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/discovery/ctlog"
)

// Candidate is one cert that matched the brand term and survived
// the owned-domain filter. Score is the composite phishing-risk
// score 0-100; the worker persists candidates with score >=
// MinPersistScore.
type Candidate struct {
	Hostname     string    `json:"hostname"`
	BrandTerm    string    `json:"brand_term"`
	Score        int       `json:"score"`   // 0-100
	Signals      []string  `json:"signals"` // human-readable factors that contributed
	DiscoveredAt time.Time `json:"discovered_at"`
}

const MinPersistScore = 60

// Detector wraps a ctlog.Client and runs the phishing-side query
// against an org's brand terms. We deliberately reuse ctlog.Client
// rather than fork the HTTP layer — the rate-limit handling +
// 50MB body cap + UA all stay in lockstep.
type Detector struct {
	CTLog *ctlog.Client
}

func NewDetector() *Detector {
	return &Detector{CTLog: ctlog.NewClient()}
}

// FindCandidates queries crt.sh for hostnames containing brandTerm,
// excludes anything ending in ownedDomains, then scores each. The
// caller (worker loop) is responsible for upserting Persist-worthy
// rows into attack_surface.
//
// brandTerm should be ≥4 chars (the SearchCandidates check
// enforces this) to avoid runaway "%ai%" / "%it%" queries.
func (d *Detector) FindCandidates(ctx context.Context, brandTerm string, ownedDomains []string) ([]Candidate, error) {
	brandTerm = strings.ToLower(strings.TrimSpace(brandTerm))
	if len(brandTerm) < 4 {
		return nil, fmt.Errorf("certphish: brand term must be ≥4 chars (got %q)", brandTerm)
	}
	// crt.sh wildcard query: `%<term>%` matches any cert whose
	// hostname contains `term` as substring. The CT log search is
	// case-insensitive and DNS-normalised.
	url := fmt.Sprintf("%s/?q=%%25%s%%25&output=json",
		d.CTLog.Endpoint, brandTerm)
	hits, err := d.queryCTLog(ctx, url)
	if err != nil {
		return nil, err
	}
	owned := normalizeOwned(ownedDomains)
	now := time.Now().UTC()
	var out []Candidate
	seen := map[string]bool{}
	for _, h := range hits {
		host := strings.ToLower(strings.TrimSpace(h))
		if host == "" || seen[host] {
			continue
		}
		seen[host] = true
		if strings.HasPrefix(host, "*.") {
			continue
		}
		if isOwned(host, owned) {
			continue
		}
		if !strings.Contains(host, brandTerm) {
			// crt.sh sometimes returns substring matches in
			// certificate metadata rather than hostname. Defend.
			continue
		}
		score, signals := scoreCandidate(host, brandTerm)
		if score == 0 {
			continue
		}
		out = append(out, Candidate{
			Hostname:     host,
			BrandTerm:    brandTerm,
			Score:        score,
			Signals:      signals,
			DiscoveredAt: now,
		})
	}
	return out, nil
}

// queryCTLog is a thin wrapper to crt.sh's JSON endpoint. The
// existing ctlog.Client.Fetch is exported specifically so we can
// issue substring queries here without duplicating the HTTP +
// rate-limit machinery.
func (d *Detector) queryCTLog(ctx context.Context, url string) ([]string, error) {
	return d.CTLog.Fetch(ctx, url)
}

// scoreCandidate computes the 0-100 phishing-risk score with
// human-readable signal attribution. Weights chosen so the
// MinPersistScore=60 threshold filters out the obvious noise
// while preserving operator triage capacity.
//
// Signals (and their weights):
//
//   - brand_label       : brand appears as a complete dot-delimited
//     label (acme.evil.tld OR login.acme.tld) (+25)
//   - brand_homograph   : digit/char substitution variant present
//     (paypa1, g00gle, app1e) (+25)
//   - hyphenated_brand  : brand (or homograph variant) appears with
//     a hyphen on either side (paypa1-login) (+15)
//   - suspicious_tld    : known phishing-favoured cheap TLD (+25)
//   - brand_embedded    : brand appears inside a generated label (+15)
//   - numeric_rotation  : brand-bearing label includes 3+ digits (+25)
//   - phishing_keyword  : login/auth/invoice/verify-style word present (+15)
//   - dga_alpha_suffix  : cheap-TLD label ends in a rotating alpha suffix (+20)
//   - subdomain_chain   : 3+ dots in hostname (kit-style nesting) (+15)
//   - punycode          : xn-- prefix or label (IDN homograph) (+30)
//
// Anything ≥60 surfaces; ≥80 is high-confidence; ≥95 is very
// strong (multiple compounded signals).
func scoreCandidate(host, brand string) (int, []string) {
	var (
		score   int
		signals []string
	)

	labels := strings.Split(host, ".")

	// 1. brand_label — brand is its own dot-delimited label.
	// Covers both prefix (acme.tld) and middle (login.acme.tld).
	for _, lbl := range labels {
		if lbl == brand {
			score += 25
			signals = append(signals, "brand_label")
			break
		}
	}

	// 2. brand embedded in a generated-looking label (fubon0617,
	// acme-login, acmepromoaa). This is weaker than brand_label, but
	// it is the common campaign shape seen in field phishing cases.
	brandEmbedded := false
	for _, lbl := range labels {
		if lbl != brand && strings.Contains(lbl, brand) {
			brandEmbedded = true
			break
		}
	}
	if brandEmbedded {
		score += 15
		signals = append(signals, "brand_embedded")
	}

	// 3. brand homograph variants (paypa1 / payp4l / g00gle).
	homograph := containsHomographOf(host, brand)
	if homograph {
		score += 25
		signals = append(signals, "brand_homograph")
	}

	// 4. hyphenated context — common phishing pattern. Fires on
	// either the literal brand OR any of its homograph variants
	// (matters for typosquats like paypa1-secure-login.xyz).
	if hasHyphenatedBrand(host, brand) || hasHyphenatedHomograph(host, brand) {
		score += 15
		signals = append(signals, "hyphenated_brand")
	}

	// 5. suspicious cheap TLD. Over-represented in real phishing
	// per APWG / Cloudflare reports.
	tld := ""
	if len(labels) >= 2 {
		tld = labels[len(labels)-1]
		if suspiciousTLD(tld) {
			score += 25
			signals = append(signals, "suspicious_tld:"+tld)
		}
	}

	// 6. numeric date/sequence token on a brand-bearing label
	// (e.g. fubon0617.icu, acme20260617-login.shop).
	if brandEmbedded && hasBrandNumericRotation(labels, brand) {
		score += 25
		signals = append(signals, "numeric_rotation")
	}

	// 7. credential collection / business lure keywords.
	if keyword := firstPhishingKeyword(host); keyword != "" {
		score += 15
		signals = append(signals, "phishing_keyword:"+keyword)
	}

	// 8. cheap-TLD label with a rotating two-letter suffix. This is
	// deliberately gated by brandEmbedded so plain facebook.icu does not
	// look like a generated campaign just because it ends in "ok".
	if brandEmbedded && suspiciousTLD(tld) && hasDGAAlphaSuffix(labels, brand) {
		score += 20
		signals = append(signals, "dga_alpha_suffix")
	}

	// 9. deep subdomain chain — kit-style nesting.
	if strings.Count(host, ".") >= 3 {
		score += 15
		signals = append(signals, "subdomain_chain")
	}

	// 10. punycode (xn-- prefix) — IDN homograph.
	if strings.HasPrefix(host, "xn--") || strings.Contains(host, ".xn--") {
		score += 30
		signals = append(signals, "punycode")
	}

	if score > 100 {
		score = 100
	}
	return score, signals
}

func suspiciousTLD(tld string) bool {
	switch tld {
	case "xyz", "top", "click", "icu", "work", "live",
		"shop", "buzz", "monster", "cyou", "fit", "vip",
		"su", "cn":
		return true
	}
	return false
}

func hasBrandNumericRotation(labels []string, brand string) bool {
	for _, lbl := range labels {
		if strings.Contains(lbl, brand) && digitRunRE.MatchString(lbl) {
			return true
		}
	}
	return false
}

func firstPhishingKeyword(host string) string {
	for _, word := range phishingKeywords {
		if strings.Contains(host, word) {
			return word
		}
	}
	return ""
}

func hasDGAAlphaSuffix(labels []string, brand string) bool {
	for _, lbl := range labels {
		if !strings.Contains(lbl, brand) || lbl == brand {
			continue
		}
		if dgaAlphaSuffixRE.MatchString(lbl) {
			return true
		}
	}
	return false
}

var (
	digitRunRE       = regexp.MustCompile(`\d{3,}`)
	dgaAlphaSuffixRE = regexp.MustCompile(`^[a-z0-9]{6,}[a-z]{2}$`)
	phishingKeywords = []string{
		"login", "signin", "sign-in", "auth", "verify", "verification",
		"account", "password", "otp", "token", "invoice", "billing",
		"secure", "update",
	}
)

func hasHyphenatedBrand(host, brand string) bool {
	return strings.Contains(host, "-"+brand) ||
		strings.Contains(host, brand+"-") ||
		strings.HasPrefix(host, brand+"-")
}

func hasHyphenatedHomograph(host, brand string) bool {
	for _, v := range homographVariants(brand) {
		if v == brand {
			continue
		}
		if strings.Contains(host, "-"+v) ||
			strings.Contains(host, v+"-") {
			return true
		}
	}
	return false
}

func homographVariants(brand string) []string {
	subs := []struct{ from, to string }{
		{"a", "4"}, {"e", "3"}, {"i", "1"}, {"l", "1"},
		{"o", "0"}, {"s", "5"},
	}
	out := []string{brand}
	for _, sub := range subs {
		if !strings.Contains(brand, sub.from) {
			continue
		}
		v := strings.ReplaceAll(brand, sub.from, sub.to)
		if v != brand {
			out = append(out, v)
		}
	}
	return out
}

// containsHomographOf checks for common typosquat character
// substitutions (paypal → paypa1, payp4l, paypaI). The check is
// conservative — only digit substitutions, not full Unicode
// homograph (that's the punycode signal).
func containsHomographOf(host, brand string) bool {
	if len(brand) < 4 {
		return false
	}
	// Build common substitutions.
	subs := []struct{ from, to string }{
		{"a", "4"}, {"a", "@"},
		{"e", "3"},
		{"i", "1"}, {"i", "l"},
		{"l", "1"}, {"l", "I"},
		{"o", "0"},
		{"s", "5"}, {"s", "$"},
	}
	for _, sub := range subs {
		if !strings.Contains(brand, sub.from) {
			continue
		}
		variant := strings.ReplaceAll(brand, sub.from, sub.to)
		if variant == brand {
			continue
		}
		if strings.Contains(host, strings.ToLower(variant)) {
			return true
		}
	}
	return false
}

// normalizeOwned converts the org's owned-domain list to a set of
// lowercase root domains for fast O(1) suffix matching.
func normalizeOwned(domains []string) map[string]bool {
	out := map[string]bool{}
	for _, d := range domains {
		d = strings.ToLower(strings.TrimSpace(d))
		if d != "" {
			out[d] = true
		}
	}
	return out
}

// isOwned reports whether host belongs to one of the org's owned
// domains (host equals or is a subdomain of). Strict suffix match
// — `acmecorp.com` does NOT match `me.com`.
func isOwned(host string, owned map[string]bool) bool {
	if owned[host] {
		return true
	}
	for d := range owned {
		if strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}
