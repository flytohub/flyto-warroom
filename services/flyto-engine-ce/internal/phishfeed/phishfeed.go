package phishfeed

// Package phishfeed — daily ingestion of community-curated
// phishing URL feeds (PhishTank + OpenPhish) and correlation with
// each org's brand terms. Output is persisted as attack_surface
// rows with asset_type=phishing_url so existing UIs render the
// hits without new components.
//
// Honesty posture (mirrors [[no_overclaim_impersonation]]):
//
//   - PhishTank entries are community-submitted and verified by
//     other PhishTank users. We surface `verified` and
//     `submission_time` in metadata so operators see the trust
//     level of each row.
//   - OpenPhish community feed is heuristically-scored; entries
//     surface as "claimed phishing" rather than "confirmed
//     phishing". The takedown letter flow stays the same — the
//     operator still has to attest to brand rights before sending.
//
// Cost: both feeds are free for non-commercial use. PhishTank
// requires an API key for the JSON download (free signup). OpenPhish
// community feed is unauthenticated. We tolerate either being
// unreachable — feeds are advisory, not load-bearing.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/httpx"
	"golang.org/x/net/publicsuffix"
)

// Entry is one row in a normalized phishing feed. Source-specific
// fields go into Raw so the worker can persist the JSON blob for
// audit without expanding the canonical struct each time a source
// changes shape.
type Entry struct {
	URL           string    `json:"url"`
	Source        string    `json:"source"` // phishtank | openphish
	SubmittedAt   time.Time `json:"submitted_at,omitempty"`
	Verified      bool      `json:"verified"`
	TargetedBrand string    `json:"targeted_brand,omitempty"` // source-supplied; ours may override on correlate
	DetailURL     string    `json:"detail_url,omitempty"`     // source-side investigation page
	Raw           string    `json:"raw,omitempty"`            // JSON-encoded source-native row, capped 2KB
}

// Fetcher pulls one feed's current snapshot and returns normalised
// entries. Implementations MUST honour the ctx deadline (the worker
// caps fetches at 30s) and MUST NOT mutate the returned slice after
// returning — the worker may share it across orgs.
type Fetcher interface {
	Name() string
	Fetch(ctx context.Context) ([]Entry, error)
}

// ── PhishTank fetcher ─────────────────────────────────────────────

// PhishTankFetcher downloads the online-valid.json feed. API key
// is required for the JSON download per PhishTank's recent terms;
// set FLYTO_PHISHTANK_API_KEY env to enable. When empty, the
// fetcher returns an empty result without error (so worker loop
// continues with the other feeds).
type PhishTankFetcher struct {
	APIKey string
	Client *http.Client
}

func NewPhishTankFetcher(apiKey string) *PhishTankFetcher {
	return &PhishTankFetcher{
		APIKey: strings.TrimSpace(apiKey),
		Client: httpx.New(30 * time.Second),
	}
}

func (f *PhishTankFetcher) Name() string { return "phishtank" }

func (f *PhishTankFetcher) Fetch(ctx context.Context) ([]Entry, error) {
	if f.APIKey == "" {
		// Documented soft-fail — worker logs a hint at boot.
		return nil, nil
	}
	endpoint := fmt.Sprintf(
		"https://data.phishtank.com/data/%s/online-valid.json",
		url.PathEscape(f.APIKey),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "flyto2-phishfeed/1.0 (+https://flyto2.com/phishfeed)")
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("phishtank: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// PhishTank ratelimits aggressively — caller should back
		// off, not retry. Return a typed error so the worker
		// logs a clearer hint.
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("phishtank: status %d: %s", resp.StatusCode, body)
	}

	// PhishTank JSON: large array of objects. Streaming decode keeps
	// memory bounded at a few MB.
	dec := json.NewDecoder(resp.Body)
	// Read the opening '['.
	if _, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("phishtank: open: %w", err)
	}
	var out []Entry
	for dec.More() {
		var row struct {
			PhishID          json.Number `json:"phish_id"`
			URL              string      `json:"url"`
			PhishDetailURL   string      `json:"phish_detail_url"`
			SubmissionTime   string      `json:"submission_time"`
			Verified         string      `json:"verified"`
			VerificationTime string      `json:"verification_time"`
			Online           string      `json:"online"`
			Target           string      `json:"target"`
		}
		if err := dec.Decode(&row); err != nil {
			return nil, fmt.Errorf("phishtank: decode row: %w", err)
		}
		if row.URL == "" || row.Online != "yes" {
			continue
		}
		t, _ := time.Parse(time.RFC3339, row.SubmissionTime)
		raw, _ := json.Marshal(row)
		out = append(out, Entry{
			URL:           row.URL,
			Source:        "phishtank",
			SubmittedAt:   t,
			Verified:      strings.EqualFold(row.Verified, "yes"),
			TargetedBrand: row.Target,
			DetailURL:     row.PhishDetailURL,
			Raw:           truncateRaw(string(raw)),
		})
	}
	return out, nil
}

// ── OpenPhish fetcher ─────────────────────────────────────────────

// OpenPhishFetcher pulls the unauthenticated community feed —
// plain text, one URL per line, refreshed every ~5 min. License
// is free for non-commercial use; the Premium feed requires a
// paid subscription if Flyto2 eventually counts as commercial.
type OpenPhishFetcher struct {
	Client *http.Client
}

func NewOpenPhishFetcher() *OpenPhishFetcher {
	return &OpenPhishFetcher{Client: httpx.New(30 * time.Second)}
}

func (f *OpenPhishFetcher) Name() string { return "openphish" }

func (f *OpenPhishFetcher) Fetch(ctx context.Context) ([]Entry, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://openphish.com/feed.txt", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "flyto2-phishfeed/1.0 (+https://flyto2.com/phishfeed)")
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openphish: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openphish: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20)) // 8MB cap
	if err != nil {
		return nil, fmt.Errorf("openphish: read: %w", err)
	}
	now := time.Now().UTC()
	var out []Entry
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, Entry{
			URL:         line,
			Source:      "openphish",
			SubmittedAt: now,
			// OpenPhish community feed entries are not formally
			// verified — they're heuristically detected. Leave
			// Verified=false; the UI surfaces this as "claimed".
			Verified: false,
		})
	}
	return out, nil
}

// ── correlation ───────────────────────────────────────────────────

// Match represents one feed entry that hit one of an org's brand
// terms. brand_term is the matched needle so the UI can show
// operators exactly why we flagged it.
type Match struct {
	Entry      Entry
	BrandTerm  string
	Confidence float64         // 0..1; 1.0 = exact brand-in-hostname; 0.5 = brand in path
	Intel      URLIntelligence // derived campaign metadata for operator triage
}

// URLIntelligence carries the field-analysis hints operators need when a
// daily phishing feed contains many related URLs: cheap TLD, date/alpha
// rotation, credential-flow words, path shape, and the campaign cluster key.
type URLIntelligence struct {
	Host              string
	RegistrableDomain string
	TLD               string
	HostPattern       string
	PathPattern       string
	CampaignKey       string
	CampaignSize      int
	Signals           []string
	TriageHints       []string
}

// CorrelateOrg filters a feed against one org's brand terms and
// returns matches. brandTerms should include: the org's primary
// domain root (e.g. "acme.com"), well-known org name variants
// (e.g. "acme", "Acme Inc"), and any repo/product names the
// operator has tagged as brand assets.
//
// Matching rules:
//
//   - Hostname contains brand → confidence 1.0 (strongest)
//   - URL path/query contains brand → confidence 0.5 (weaker; the
//     phishing page may just reference the brand)
//   - Brand is < 4 chars → SKIP (too noisy; "ibm" matches every
//     hostname starting with "ibm-anything")
//
// The thresholds are deliberately conservative — false positives
// here generate operator-visible noise and break the trust
// posture. Better to miss a borderline match than to flag a
// generic URL.
func CorrelateOrg(entries []Entry, brandTerms []string) []Match {
	// Pre-clean + dedup brand terms.
	terms := uniqueLowercase(brandTerms, 4)
	if len(terms) == 0 {
		return nil
	}
	var out []Match
	for _, e := range entries {
		u, err := url.Parse(e.URL)
		if err != nil || u.Host == "" {
			continue
		}
		host := strings.ToLower(u.Host)
		path := strings.ToLower(u.Path + "?" + u.RawQuery)
		for _, t := range terms {
			if strings.Contains(host, t) {
				out = append(out, Match{Entry: e, BrandTerm: t, Confidence: 1.0})
				break
			}
			if strings.Contains(path, t) {
				out = append(out, Match{Entry: e, BrandTerm: t, Confidence: 0.5})
				break
			}
		}
	}
	return annotateCampaigns(out)
}

var (
	digitRunRE      = regexp.MustCompile(`\d{3,}`)
	pathDigitRE     = regexp.MustCompile(`\d+`)
	hexRunRE        = regexp.MustCompile(`[a-f0-9]{12,}`)
	alphaSuffixRE   = regexp.MustCompile(`^([a-z0-9]{6,})([a-z]{2})$`)
	credentialWords = []string{
		"login", "signin", "sign-in", "auth", "verify", "verification",
		"account", "password", "otp", "token", "invoice", "billing",
		"secure", "update",
	}
)

var campaignCheapTLDs = map[string]bool{
	"xyz": true, "top": true, "click": true, "icu": true, "work": true,
	"live": true, "shop": true, "buzz": true, "monster": true,
	"cyou": true, "fit": true, "vip": true, "su": true, "cn": true,
}

func annotateCampaigns(matches []Match) []Match {
	if len(matches) == 0 {
		return matches
	}
	counts := map[string]int{}
	for i := range matches {
		intel := AnalyzeURL(matches[i].Entry.URL, matches[i].BrandTerm)
		if matches[i].Confidence >= 1.0 {
			intel.Signals = appendUnique(intel.Signals, "brand_in_host")
		} else {
			intel.Signals = appendUnique(intel.Signals, "brand_in_path")
		}
		matches[i].Intel = intel
		if intel.CampaignKey != "" {
			counts[intel.CampaignKey]++
		}
	}
	for i := range matches {
		key := matches[i].Intel.CampaignKey
		if key == "" {
			continue
		}
		size := counts[key]
		matches[i].Intel.CampaignSize = size
		if size >= 2 {
			matches[i].Intel.Signals = appendUnique(matches[i].Intel.Signals, "campaign_cluster")
			matches[i].Intel.TriageHints = appendUnique(matches[i].Intel.TriageHints,
				"investigate_redirect_target",
				"check_registrar_rdap",
				"compare_target_url_before_bulk_takedown",
			)
		}
	}
	return matches
}

// AnalyzeURL derives URL-shape intelligence without making network requests.
// It intentionally does not claim the URL redirects; it only marks when the
// URL shape is consistent with bulk DGA/redirector campaigns.
func AnalyzeURL(rawURL, brandTerm string) URLIntelligence {
	var out URLIntelligence
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return out
	}
	host := strings.ToLower(u.Hostname())
	out.Host = host
	out.RegistrableDomain = registrableDomain(host)
	out.TLD = lastLabel(host)
	if campaignCheapTLDs[out.TLD] {
		out.Signals = appendUnique(out.Signals, "suspicious_tld:"+out.TLD)
		out.TriageHints = appendUnique(out.TriageHints, "cheap_tld_bulk_registration")
	}
	out.HostPattern, out.Signals = normalizeHostPattern(host, brandTerm, out.TLD, out.Signals)
	out.PathPattern, out.Signals = normalizePathPattern(u, out.Signals)
	if out.HostPattern != "" {
		out.CampaignKey = strings.Join([]string{
			strings.ToLower(strings.TrimSpace(brandTerm)),
			out.HostPattern,
			out.PathPattern,
		}, "|")
	}
	return out
}

func normalizeHostPattern(host, brandTerm, tld string, signals []string) (string, []string) {
	labels := strings.Split(host, ".")
	if len(labels) == 0 {
		return host, signals
	}
	brand := compactBrand(brandTerm)
	for i, label := range labels {
		if label == "" {
			continue
		}
		l := strings.ToLower(label)
		if brand != "" && strings.Contains(compactBrand(l), brand) && compactBrand(l) != brand {
			signals = appendUnique(signals, "brand_embedded_label")
		}
		for _, word := range credentialWords {
			if strings.Contains(l, word) {
				signals = appendUnique(signals, "credential_keyword:"+word)
				break
			}
		}
		if digitRunRE.MatchString(l) {
			signals = appendUnique(signals, "dga_numeric_token")
			l = digitRunRE.ReplaceAllString(l, "{num}")
		}
		if campaignCheapTLDs[tld] && brand != "" && strings.Contains(compactBrand(l), brand) && compactBrand(l) != brand {
			if parts := alphaSuffixRE.FindStringSubmatch(l); len(parts) == 3 {
				signals = appendUnique(signals, "dga_alpha_suffix")
				l = parts[1] + "{alpha2}"
			}
		}
		labels[i] = l
	}
	return strings.Join(labels, "."), signals
}

func normalizePathPattern(u *url.URL, signals []string) (string, []string) {
	path := strings.ToLower(strings.TrimSpace(u.EscapedPath()))
	if path == "" {
		path = "/"
	}
	for _, word := range credentialWords {
		if strings.Contains(path, word) || strings.Contains(strings.ToLower(u.RawQuery), word) {
			signals = appendUnique(signals, "credential_keyword:"+word)
			break
		}
	}
	path = hexRunRE.ReplaceAllString(path, "{hex}")
	path = pathDigitRE.ReplaceAllString(path, "{num}")
	if u.RawQuery != "" {
		path += "?"
		keys := queryKeys(u.RawQuery)
		if len(keys) > 0 {
			path += strings.Join(keys, "&")
		}
	}
	return path, signals
}

func queryKeys(raw string) []string {
	values, err := url.ParseQuery(raw)
	if err != nil {
		return nil
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	return keys
}

func registrableDomain(host string) string {
	if host == "" {
		return ""
	}
	if rd, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return rd
	}
	parts := strings.Split(host, ".")
	if len(parts) < 2 {
		return host
	}
	return parts[len(parts)-2] + "." + parts[len(parts)-1]
}

func lastLabel(host string) string {
	parts := strings.Split(strings.Trim(host, "."), ".")
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

func compactBrand(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func appendUnique(in []string, values ...string) []string {
	for _, value := range values {
		if value == "" {
			continue
		}
		seen := false
		for _, existing := range in {
			if existing == value {
				seen = true
				break
			}
		}
		if !seen {
			in = append(in, value)
		}
	}
	return in
}

func uniqueLowercase(in []string, minLen int) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.ToLower(strings.TrimSpace(s))
		if len(s) < minLen {
			continue
		}
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func truncateRaw(s string) string {
	const cap = 2048
	if len(s) <= cap {
		return s
	}
	return s[:cap-3] + "..."
}

// ErrSkippedNoAPIKey is returned by fetchers that need an API key
// the caller didn't supply. Worker treats this as informational,
// not an error.
var ErrSkippedNoAPIKey = errors.New("phishfeed: no API key configured (skipped)")
