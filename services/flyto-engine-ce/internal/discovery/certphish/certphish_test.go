package certphish

import (
	"strings"
	"testing"
)

func TestScoreCandidate_ObviousPhish(t *testing.T) {
	// paypa1-secure-login.xyz vs brand "paypal"
	// expected signals: brand_homograph, suspicious_tld, hyphenated
	// (no brand_at_start because hostname starts with paypa1 not paypal)
	score, signals := scoreCandidate("paypa1-secure-login.xyz", "paypal")
	if score < 60 {
		t.Errorf("obvious phish should score ≥60, got %d (signals=%v)", score, signals)
	}
	if !hasSignal(signals, "brand_homograph") {
		t.Errorf("expected brand_homograph signal, got %v", signals)
	}
	if !hasSignal(signals, "suspicious_tld:xyz") {
		t.Errorf("expected suspicious_tld:xyz, got %v", signals)
	}
}

func TestScoreCandidate_LegitimateLooking(t *testing.T) {
	// "google" appears in google.com (legit, but we don't filter
	// owned here — owned-filter is upstream). Score should still
	// be low because no homograph + no suspicious TLD.
	score, _ := scoreCandidate("google.com", "google")
	// brand_at_start (google.com starts with "google.") → +25
	// no other signals → 25 total
	if score >= 60 {
		t.Errorf("legitimate-looking should score <60, got %d", score)
	}
}

func TestScoreCandidate_Punycode(t *testing.T) {
	score, signals := scoreCandidate("xn--80ak6aa92e.com", "apple")
	if !hasSignal(signals, "punycode") {
		t.Errorf("punycode should be flagged, got signals=%v", signals)
	}
	if score < 30 {
		t.Errorf("punycode should add ≥30 alone, got %d", score)
	}
}

func TestScoreCandidate_DeepChain(t *testing.T) {
	score, signals := scoreCandidate("login.acme.verify-id.evil.tld", "acme")
	if !hasSignal(signals, "subdomain_chain") {
		t.Errorf("3+ dots should trigger subdomain_chain, got %v", signals)
	}
	if score < 40 {
		t.Errorf("deep chain phishing should score ≥40, got %d", score)
	}
}

func TestScoreCandidate_FieldCampaignDateRotation(t *testing.T) {
	score, signals := scoreCandidate("fubonbank0617-login.icu", "fubonbank")
	if score < MinPersistScore {
		t.Fatalf("date-rotating cheap-TLD login host should persist, got %d signals=%v", score, signals)
	}
	for _, sig := range []string{
		"brand_embedded",
		"suspicious_tld:icu",
		"numeric_rotation",
		"phishing_keyword:login",
	} {
		if !hasSignal(signals, sig) {
			t.Errorf("missing signal %q in %v", sig, signals)
		}
	}
}

func TestScoreCandidate_FieldCampaignTranscriptTLDs(t *testing.T) {
	for _, tld := range []string{"vip", "su", "cn"} {
		host := "acme-login." + tld
		score, signals := scoreCandidate(host, "acme")
		if score < MinPersistScore {
			t.Fatalf("%s should persist with cheap TLD + login lure, score=%d signals=%v", host, score, signals)
		}
		if !hasSignal(signals, "suspicious_tld:"+tld) {
			t.Errorf("missing suspicious TLD signal for %s: %v", tld, signals)
		}
	}
}

func TestScoreCandidate_FieldCampaignAlphaSuffixRotation(t *testing.T) {
	score, signals := scoreCandidate("tcbbankpromoaa.shop", "tcbbankpromo")
	if score < MinPersistScore {
		t.Fatalf("alpha-suffix cheap-TLD host should persist, got %d signals=%v", score, signals)
	}
	if !hasSignal(signals, "dga_alpha_suffix") {
		t.Errorf("expected dga_alpha_suffix signal, got %v", signals)
	}
}

func TestContainsHomographOf(t *testing.T) {
	cases := []struct {
		host  string
		brand string
		want  bool
	}{
		{"paypa1.com", "paypal", true},      // l→1
		{"app1e.com", "apple", true},        // l→1
		{"g00gle.com", "google", true},      // o→0
		{"facebook.com", "facebook", false}, // no substitution
		{"unrelated.com", "paypal", false},
	}
	for _, c := range cases {
		got := containsHomographOf(c.host, c.brand)
		if got != c.want {
			t.Errorf("%s vs %s: want %v got %v", c.host, c.brand, c.want, got)
		}
	}
}

func TestIsOwned_ExactAndSubdomain(t *testing.T) {
	owned := normalizeOwned([]string{"acme.com", "shop.acme.io"})
	cases := []struct {
		host string
		want bool
	}{
		{"acme.com", true},           // exact match
		{"api.acme.com", true},       // subdomain
		{"shop.acme.io", true},       // exact (other domain)
		{"acmecorp.com", false},      // similar but not subdomain
		{"acme.com.evil.tld", false}, // doesn't end in owned
	}
	for _, c := range cases {
		got := isOwned(c.host, owned)
		if got != c.want {
			t.Errorf("%s: want %v got %v", c.host, c.want, got)
		}
	}
}

func hasSignal(signals []string, prefix string) bool {
	for _, s := range signals {
		if s == prefix || (strings.HasPrefix(s, prefix+":")) {
			return true
		}
	}
	return false
}
