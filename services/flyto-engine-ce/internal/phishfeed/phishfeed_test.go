package phishfeed

import "testing"

func TestCorrelateOrg_HostnameMatch(t *testing.T) {
	entries := []Entry{
		{URL: "https://acme-login.evil.tld/auth", Source: "phishtank"},
		{URL: "https://random.example.com/", Source: "openphish"},
	}
	got := CorrelateOrg(entries, []string{"acme"})
	if len(got) != 1 {
		t.Fatalf("want 1 hostname match, got %d", len(got))
	}
	if got[0].Confidence != 1.0 {
		t.Errorf("hostname hit should be 1.0 confidence, got %v", got[0].Confidence)
	}
	if !hasPhishSignal(got[0].Intel.Signals, "brand_in_host") {
		t.Errorf("hostname hit should carry brand_in_host signal, got %v", got[0].Intel.Signals)
	}
}

func TestCorrelateOrg_PathMatch(t *testing.T) {
	entries := []Entry{
		{URL: "https://evil.tld/acme/login.html"},
	}
	got := CorrelateOrg(entries, []string{"acme"})
	if len(got) != 1 || got[0].Confidence != 0.5 {
		t.Errorf("path hit should be 0.5 confidence, got %+v", got)
	}
	if !hasPhishSignal(got[0].Intel.Signals, "brand_in_path") {
		t.Errorf("path hit should carry brand_in_path signal, got %v", got[0].Intel.Signals)
	}
}

func TestCorrelateOrg_AddsCampaignMetadataForDateRotation(t *testing.T) {
	entries := []Entry{
		{URL: "https://fubonbank0617-login.icu/auth", Source: "openphish"},
		{URL: "https://fubonbank0618-login.icu/auth", Source: "openphish"},
	}
	got := CorrelateOrg(entries, []string{"fubonbank"})
	if len(got) != 2 {
		t.Fatalf("want 2 matches, got %d", len(got))
	}
	for _, m := range got {
		if m.Intel.CampaignSize != 2 {
			t.Fatalf("campaign size = %d, want 2 (intel=%+v)", m.Intel.CampaignSize, m.Intel)
		}
		for _, sig := range []string{
			"suspicious_tld:icu",
			"dga_numeric_token",
			"credential_keyword:login",
			"campaign_cluster",
		} {
			if !hasPhishSignal(m.Intel.Signals, sig) {
				t.Errorf("missing signal %q in %v", sig, m.Intel.Signals)
			}
		}
		if !hasPhishSignal(m.Intel.TriageHints, "investigate_redirect_target") {
			t.Errorf("missing redirect-target triage hint: %v", m.Intel.TriageHints)
		}
	}
}

func TestCorrelateOrg_AddsCampaignMetadataForAlphaSuffixRotation(t *testing.T) {
	entries := []Entry{
		{URL: "https://tcbbankpromoaa.shop/login", Source: "phishtank"},
		{URL: "https://tcbbankpromobb.shop/login", Source: "phishtank"},
	}
	got := CorrelateOrg(entries, []string{"tcbbankpromo"})
	if len(got) != 2 {
		t.Fatalf("want 2 matches, got %d", len(got))
	}
	if got[0].Intel.HostPattern != "tcbbankpromo{alpha2}.shop" {
		t.Fatalf("host pattern = %q", got[0].Intel.HostPattern)
	}
	for _, m := range got {
		if m.Intel.CampaignSize != 2 {
			t.Fatalf("campaign size = %d, want 2", m.Intel.CampaignSize)
		}
		if !hasPhishSignal(m.Intel.Signals, "dga_alpha_suffix") {
			t.Errorf("missing alpha suffix signal: %v", m.Intel.Signals)
		}
	}
}

func TestCorrelateOrg_SkipsShortTerms(t *testing.T) {
	// "ibm" (3 chars) is too short — would match every ibm-anything host.
	entries := []Entry{{URL: "https://ibm-shop.evil.tld/login"}}
	got := CorrelateOrg(entries, []string{"ibm"})
	if len(got) != 0 {
		t.Errorf("3-char term should be skipped, matched anyway: %+v", got)
	}
}

func TestCorrelateOrg_DedupBrandTerms(t *testing.T) {
	// Same brand listed twice (capitalisation variant) should not
	// produce two matches for the same entry.
	entries := []Entry{{URL: "https://acme-evil.tld/"}}
	got := CorrelateOrg(entries, []string{"ACME", "acme", "Acme"})
	if len(got) != 1 {
		t.Errorf("want 1 match after dedup, got %d", len(got))
	}
}

func TestCorrelateOrg_HostBeatsPath(t *testing.T) {
	// Same entry has brand in both host and path; we report once,
	// with the stronger (hostname) confidence.
	entries := []Entry{{URL: "https://acme.evil.tld/acme/"}}
	got := CorrelateOrg(entries, []string{"acme"})
	if len(got) != 1 || got[0].Confidence != 1.0 {
		t.Errorf("hostname-and-path should de-dup to single 1.0 match, got %+v", got)
	}
}

func TestCorrelateOrg_IgnoresUnparseable(t *testing.T) {
	entries := []Entry{
		{URL: "not-a-url"},
		{URL: ""},
		{URL: "https://acme.evil.tld/"},
	}
	got := CorrelateOrg(entries, []string{"acme"})
	if len(got) != 1 {
		t.Errorf("unparseable URLs should drop silently, got %+v", got)
	}
}

func TestUniqueLowercase(t *testing.T) {
	got := uniqueLowercase([]string{"ACME", "Acme", "x", "  acme.com  ", ""}, 4)
	if len(got) != 2 {
		t.Errorf("want 2 unique ≥4-char terms, got %v", got)
	}
}

func hasPhishSignal(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
