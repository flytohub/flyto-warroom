// Package canon centralises the canonicalisation rules every kernel
// writer must apply before a value reaches kernel_resources or any
// dedupe key.
//
// Why this package exists:
// before P1-J there were 4 parallel implementations
// (internal/footprint/entity.CanonicalName, reskernel.normaliseValue,
// reskernel.normalizeAlias, plus ad-hoc TrimPrefix loops in connectors).
// Drift between them produced the 2026-05-24 prod incident where
// "https://flyto2.com" was stored as both a subdomain row and an
// organization row, distinct from the clean "flyto2.com" row that
// already existed. See docs/REPORT_AUDIT.md and the P0 cleanup audit
// for context.
//
// Rules live here. Writers call canon.For(typ, raw). New canonical
// rules are added here and nowhere else. The
// scripts/lint-no-direct-url-strip.sh script forbids
// `strings.TrimPrefix(_, "https://")` outside this file.
package canon

import (
	"net"
	"net/url"
	"strings"
)

// For dispatches to the right canonicalisation function based on the
// kernel-resource type string. Unknown types fall through to a safe
// lowercase+trim so we never silently store an un-normalised value.
//
// Type strings here must stay in lock-step with the type column of
// kernel_resources and the EntityType constants in
// internal/footprint/entity.go.
func For(typ, raw string) string {
	switch strings.ToLower(strings.TrimSpace(typ)) {
	case "domain":
		return RegistrableDomain(raw)
	case "subdomain":
		return Host(raw)
	case "email_domain":
		return RegistrableDomain(raw)
	case "email":
		return Email(raw)
	case "url", "document", "news_mention":
		return URLPath(raw)
	case "handle":
		return Handle(raw)
	case "repo":
		return Repo(raw)
	case "organization":
		return Org(raw)
	case "ip", "asn", "vendor", "technology", "app":
		// already keyed by external registry; just normalise whitespace + case.
		return strings.TrimSpace(strings.ToLower(raw))
	case "cloud_resource", "cloud_network", "cloud_identity":
		// The provider-specific canonicaliser (internal/cloudscan/<provider>)
		// is the SOLE authority for case here: component-level rules differ per
		// provider/service (AWS IAM names + EC2 ids lowercased, Lambda function
		// names case-preserved; GCP resource names preserved). The value
		// arrives already canonicalised, so the kernel MUST NOT re-fold case or
		// it would split/collapse identity wrongly despite a correct provider
		// canonicaliser. Trim whitespace only - no case change.
		return strings.TrimSpace(raw)
	case "cloud_account":
		// Account canonical is "{provider}:{account_locator}"; provider is
		// lowercase and locators carry no case-sensitive component (AWS account
		// id is digits, GCP project id is lowercase per spec, Azure subscription
		// UUID is lowercased per RFC 4122). Lowercase+trim is safe and defensive.
		return strings.TrimSpace(strings.ToLower(raw))
	}
	return strings.TrimSpace(strings.ToLower(raw))
}

// Host returns the bare host of a URL-ish input:
// lowercase, scheme/user@/path/query/fragment/port/trailing-dot stripped.
// Use this for Subdomain (full host) and as the building block for
// every other URL-ish canonicaliser in this package.
//
//	Host("https://Flyto2.COM/?utm=x")       → "flyto2.com"
//	Host("http://user:pw@a.b.c:8443/foo")   → "a.b.c"
//	Host("x.flyto2.com.")                   → "x.flyto2.com"
func Host(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	s = StripScheme(s)
	if at := strings.LastIndex(s, "@"); at > 0 {
		s = s[at+1:]
	}
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		s = s[:i]
	}
	if i := strings.LastIndex(s, ":"); i > 0 && allDigits(s[i+1:]) {
		s = s[:i]
	}
	return strings.TrimSuffix(s, ".")
}

// multiSegmentCCTLD lists the second-level public suffixes the
// "last two labels" heuristic would otherwise collapse wrongly
// (e.g. taishinbank.com.tw → com.tw). Keeping a small explicit set
// avoids pulling in golang.org/x/net/publicsuffix while covering the
// ccTLDs that actually show up in the customer base (TW/HK/SG/JP/KR/
// UK/AU/NZ). Kept in sync with rootApex in
// cmd/worker/phishfeed_loop.go.
var multiSegmentCCTLD = map[string]bool{
	"co.uk": true, "co.jp": true, "co.kr": true, "co.nz": true,
	"com.au": true, "com.tw": true, "com.hk": true, "com.sg": true,
}

// RegistrableDomain returns the eTLD+1 of an input — "last two
// labels" heuristic with an explicit second-level-ccTLD table so
// multi-segment suffixes (`foo.co.uk`, `taishinbank.com.tw`) resolve
// to the real registrable domain instead of collapsing to the bare
// suffix. The table is best-effort; if you need full public-suffix
// accuracy, switch to golang.org/x/net/publicsuffix here without
// changing any caller.
func RegistrableDomain(raw string) string {
	s := Host(raw)
	if s == "" {
		return ""
	}
	parts := strings.Split(s, ".")
	if len(parts) < 2 {
		return s
	}
	// When the trailing two labels form a known second-level ccTLD,
	// the registrable domain needs three labels (label + suffix).
	if len(parts) >= 3 {
		tail2 := parts[len(parts)-2] + "." + parts[len(parts)-1]
		if multiSegmentCCTLD[tail2] {
			return strings.Join(parts[len(parts)-3:], ".")
		}
	}
	return strings.Join(parts[len(parts)-2:], ".")
}

// publicSuffixSecondLevel lists the second-level public suffixes that are
// themselves registries, not registrable domains. A value equal to one of
// these (e.g. "com.tw") is a bare public suffix and must NOT be stored as an
// org-owned domain asset. Mirrors multiSegmentCCTLD plus the common bare
// ccTLD/gTLD set. Best-effort, not exhaustive — full accuracy would require
// golang.org/x/net/publicsuffix, but this covers the real customer base and
// the noise classes the operator reported.
var publicSuffixSecondLevel = map[string]bool{
	"co.uk": true, "co.jp": true, "co.kr": true, "co.nz": true,
	"com.au": true, "com.tw": true, "com.hk": true, "com.sg": true,
	"org.uk": true, "org.tw": true, "gov.tw": true, "edu.tw": true,
	"net.tw": true, "ne.jp": true, "or.jp": true,
}

// plausibleTLDs is a conservative allow-set of the TLDs/last-labels that show
// up in the customer base plus the dominant gTLDs. A registrable domain whose
// final label is not in this set is treated as implausible and rejected at the
// write boundary. This is intentionally an allow-list, not a deny-list: the
// failure mode we are guarding against (operator-reported) is malformed /
// junk values like a bare "go" landing as a domain. Adding a new legit TLD is
// a one-line change here; over-permissiveness is what produced the noise.
var plausibleTLDs = map[string]bool{
	"com": true, "net": true, "org": true, "io": true, "co": true,
	"ai": true, "app": true, "dev": true, "info": true, "biz": true,
	"me": true, "tv": true, "us": true, "uk": true, "tw": true,
	"hk": true, "sg": true, "jp": true, "kr": true, "cn": true,
	"au": true, "nz": true, "ca": true, "de": true, "fr": true,
	"es": true, "it": true, "nl": true, "eu": true, "in": true,
	"xyz": true, "cloud": true, "tech": true, "online": true,
	"site": true, "store": true, "gov": true, "edu": true, "mil": true,
	"int": true, "ru": true, "br": true, "mx": true, "ch": true,
	"se": true, "no": true, "fi": true, "dk": true, "pl": true,
	"id": true, "my": true, "ph": true, "vn": true, "th": true,
	// RFC2606 / RFC6761 reserved TLDs — never real customer domains, but
	// docs and tests legitimately use them as synthetic hosts, so they must
	// pass the write-boundary gate (a "shop.example.test" fixture domain is
	// well-formed; rejecting it would break test seeding, not block noise).
	"example": true, "test": true, "invalid": true,
}

// ValidRegistrableDomain reports whether host is a well-formed, plausibly-real
// registrable domain (eTLD+1) or a host under one. It rejects the noise
// classes the operator flagged at the /domains write boundary:
//
//   - single-label values with no dot ("go", "localhost")
//   - a bare public suffix itself ("com.tw", "co.uk")
//   - IPv4 / IPv6 literals (those are ip assets, not domains)
//   - empty / overlong / label-malformed values
//   - a last label that is not a plausible TLD
//
// It is deliberately conservative — a real subdomain of a real seed
// (blog.flyto2.com) and a real apex (flyto2.com) both pass; junk does not.
// Use this BEFORE writing any domain/subdomain/email_domain asset so
// third-party-service apexes that ARE valid domains (google.com) still pass
// the syntactic gate and are filtered later by the attribution check — this
// function only kills malformed values, not legitimately-formed third parties.
func ValidRegistrableDomain(host string) bool {
	s := Host(host)
	if s == "" {
		return false
	}
	// IP literals are not domains. IPv4 dotted-quad: all-digit labels.
	if net.ParseIP(s) != nil {
		return false
	}
	if len(s) > 253 {
		return false
	}
	parts := strings.Split(s, ".")
	if len(parts) < 2 {
		// Single label ("go", "localhost") — not a registrable domain.
		return false
	}
	for _, p := range parts {
		if p == "" || len(p) > 63 {
			return false // empty label (".." or trailing dot artefact) or overlong
		}
		for _, r := range p {
			if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '-' {
				// Allow IDN punycode (xn--) which is a-z0-9- only after
				// lowercasing; reject anything else (spaces, underscores,
				// raw unicode that should have been punycoded upstream).
				return false
			}
		}
	}
	last := parts[len(parts)-1]
	// All-digit last label means this was an IP-ish value that slipped past
	// net.ParseIP (e.g. "1.2.3.999") — not a domain.
	if allDigits(last) {
		return false
	}
	// Reject a value that is EXACTLY a bare public suffix (e.g. "com.tw").
	if publicSuffixSecondLevel[s] {
		return false
	}
	// A registrable domain's TLD must be plausible. Third-party-but-valid
	// domains (google.com) pass here on purpose — dropping those is the
	// attribution gate's job, not the syntax gate's; this allow-list only
	// kills genuinely-implausible last labels (e.g. "notarealtldxyzzy").
	if !plausibleTLDs[last] {
		return false
	}
	return true
}

// URLPath canonicalises a full URL while preserving the path. Used
// for document/news_mention kernel types where the path component is
// load-bearing (different paths on the same host are different
// resources). Strips query and fragment so "?utm=x" tracking noise
// stops creating duplicate rows.
//
//	URLPath("HTTPS://Foo.com/Path?utm=x#frag") → "https://foo.com/Path"
//	URLPath("foo.com/x/")                      → "https://foo.com/x"
func URLPath(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return strings.ToLower(s)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "" {
		scheme = "https"
	}
	host := strings.ToLower(u.Host)
	if i := strings.LastIndex(host, ":"); i > 0 && allDigits(host[i+1:]) {
		if (scheme == "http" && host[i+1:] == "80") || (scheme == "https" && host[i+1:] == "443") {
			host = host[:i]
		}
	}
	path := strings.TrimRight(u.Path, "/")
	if path == "" {
		// Bare host — match Host()'s output for dedupe with
		// subdomain rows that share the same key.
		return scheme + "://" + host
	}
	return scheme + "://" + host + path
}

// Email normalises an email address: lowercase + trim. Local-part
// case sensitivity is technically allowed by RFC but operational
// reality is that "INFO@flyto2.com" and "info@flyto2.com" route to the same
// mailbox; treat them as one identity.
func Email(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	// Guard against pasted "<info@flyto2.com>" or "mailto:info@flyto2.com".
	s = strings.TrimPrefix(s, "mailto:")
	s = strings.Trim(s, "<>")
	return s
}

// Handle normalises a social/code handle of the form "platform:user"
// (e.g. "github:acme-bank"). Lowercase. Leading "@" is stripped
// because users paste both shapes.
func Handle(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	if i := strings.IndexByte(s, ':'); i >= 0 {
		platform := s[:i]
		user := strings.TrimPrefix(s[i+1:], "@")
		return platform + ":" + user
	}
	return strings.TrimPrefix(s, "@")
}

// Repo canonicalises a repository identifier of the form
// "host/owner/name", lowercase. Caller is responsible for assembling
// the full triplet — this does not extract owner/name from a URL.
func Repo(raw string) string {
	return strings.TrimSpace(strings.ToLower(raw))
}

// Org normalises an organisation display name: trim, collapse
// internal whitespace, strip common corporate suffixes. Does NOT
// lowercase — display value preservation matters more than
// deduplication of capitalisation differences.
//
// 2026-05-23 incident: seed.OrgName being set to "https://flyto2.com"
// produced a phantom Organization entity. Treat URL-ish input as a
// host and let downstream dedupe merge against the real org.
func Org(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	low := strings.ToLower(s)
	if strings.HasPrefix(low, "http://") || strings.HasPrefix(low, "https://") || strings.HasPrefix(low, "//") {
		// Phantom URL-as-org-name. Reduce to host so dedupe layer
		// can merge into the real Domain entity if one exists.
		return Host(s)
	}

	// Strip common corporate-suffix noise. Order matters — strip
	// multi-word suffixes before single-word so " co.,ltd" doesn't
	// hit " co" first.
	low = " " + strings.ToLower(s) + " "
	for _, suf := range []string{
		" inc.", " inc ", " corp.", " corp ", " corporation ",
		" ltd.", " ltd ", " limited ", " llc ",
		" gmbh ", " ag ", " s.a.", " sa ",
		" co.,ltd.", " co.,ltd ", " co., ltd.", " co., ltd ",
		" co.", " co ",
		" 股份有限公司 ", "股份有限公司 ",
		" 有限公司 ", "有限公司 ",
		" 公司 ", "公司 ",
	} {
		low = strings.ReplaceAll(low, suf, " ")
	}
	low = strings.TrimSpace(low)
	low = strings.Join(strings.Fields(low), " ")
	return low
}

// StripScheme removes http://, https://, // prefixes if present.
// Exported so packages that legitimately need to peel a URL down
// (e.g. logging, display formatting) don't have to reimplement.
// New writer code should prefer Host() or URLPath() — StripScheme
// alone is rarely the right answer.
func StripScheme(s string) string {
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "//")
	return s
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
