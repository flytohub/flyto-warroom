package canon

import "testing"

// TestFor_PinsProdPollutionShape — the 2 polluted rows in the
// 2026-05-24 P0 audit had:
//
//	type=subdomain      value="https://flyto2.com"
//	type=organization   value="https://flyto2.com"
//
// while the clean row already existed:
//
//	type=subdomain      value="flyto2.com"
//
// Future writers must NEVER produce those two strings again. Add
// new pollution variants here, never delete entries.
func TestFor_PinsProdPollutionShape(t *testing.T) {
	cases := []struct {
		typ, raw, want string
	}{
		{"subdomain", "https://flyto2.com", "flyto2.com"},
		{"subdomain", "HTTPS://Flyto2.COM/?utm=x", "flyto2.com"},
		{"subdomain", "//flyto2.com", "flyto2.com"},
		{"subdomain", "flyto2.com.", "flyto2.com"},
		{"subdomain", "user:pw@flyto2.com:8443/foo", "flyto2.com"},
		{"organization", "https://flyto2.com", "flyto2.com"},
		{"organization", "  Flyto2  ", "flyto2"},
		{"organization", "Acme Bank Inc.", "acme bank"},
		{"organization", "Acme 股份有限公司", "acme"},
		{"domain", "https://Mail.flyto2.com/path", "flyto2.com"},
		{"domain", "foo.bar", "foo.bar"},
		{"email_domain", "dev+noreply-mail-flyto2-com@flyto2.com", "flyto2.com"},
		{"email", "dev+foo-bar-example-com@flyto2.com", "dev+foo-bar-example-com@flyto2.com"},
		{"email", "<dev+foo-x-com@flyto2.com>", "dev+foo-x-com@flyto2.com"},
		{"email", "mailto:dev+foo-x-com@flyto2.com", "dev+foo-x-com@flyto2.com"},
		{"handle", "@AcmeBank", "acmebank"},
		{"handle", "github:@AcmeBank", "github:acmebank"},
		{"handle", "GitHub:Acme-Bank", "github:acme-bank"},
		{"repo", "GitHub.com/Foo/Bar", "github.com/foo/bar"},
		{"url", "HTTPS://Foo.com/Path?utm=x#frag", "https://foo.com/Path"},
		{"url", "foo.com/x/", "https://foo.com/x"},
		{"url", "https://foo.com:443/", "https://foo.com"},
		{"document", "https://docs.foo.com/page#section", "https://docs.foo.com/page"},
	}
	for _, c := range cases {
		got := For(c.typ, c.raw)
		if got != c.want {
			t.Errorf("For(%q,%q) = %q; want %q", c.typ, c.raw, got, c.want)
		}
	}
}

// TestValidRegistrableDomain pins the write-boundary validity gate that
// keeps the noise classes the operator reported (2026-06) out of /domains:
// single-label junk ("go"), bare public suffixes, IP literals, and malformed
// hosts are rejected; real apexes + subdomains (including legitimate
// third-party-looking ones) are accepted at the SYNTACTIC layer (third-party
// attribution is a separate, later gate — this function only kills malformed
// values).
func TestValidRegistrableDomain(t *testing.T) {
	valid := []string{
		"flyto2.com",
		"blog.flyto2.com",
		"a.b.c.flyto2.com",
		"google.com",           // valid form — attribution gate filters it, not this
		"misc-sni.youtube.com", // valid host form — also attribution-filtered later
		"nanshanlife.com.tw",
		"foo.co.uk",
		"example.io",
		"xn--fsq.com", // IDN punycode apex
		"HTTPS://Mail.Flyto2.com/path",
	}
	for _, v := range valid {
		if !ValidRegistrableDomain(v) {
			t.Errorf("ValidRegistrableDomain(%q) = false; want true", v)
		}
	}
	invalid := []string{
		"",
		"go",                   // single label — operator-reported noise
		"localhost",            // single label
		"com.tw",               // bare public suffix
		"co.uk",                // bare public suffix
		"1.2.3.4",              // IPv4 literal
		"::1",                  // IPv6 literal
		"192.168.0.1",          // private IPv4
		"foo.123",              // all-digit TLD
		"foo.notarealtldxyzzy", // implausible TLD
		"foo .com",             // space in label
		"foo_bar.com",          // underscore in label
		".com",                 // empty leading label
		"foo..com",             // empty middle label
	}
	for _, v := range invalid {
		if ValidRegistrableDomain(v) {
			t.Errorf("ValidRegistrableDomain(%q) = true; want false", v)
		}
	}
}

// TestHost_EdgeCases pins the bare-host extraction. Host() is the
// building block under every URL-ish type, so its edge cases get
// their own table.
func TestHost_EdgeCases(t *testing.T) {
	cases := []struct {
		raw, want string
	}{
		{"flyto2.com", "flyto2.com"},
		{"flyto2.com/", "flyto2.com"},
		{"flyto2.com:80", "flyto2.com"},
		{"flyto2.com:8443", "flyto2.com"},
		{"flyto2.com:not-port", "flyto2.com:not-port"},
		{"a.b.c.flyto2.com", "a.b.c.flyto2.com"},
		{"  HTTP://Flyto2.COM  ", "flyto2.com"},
		{"", ""},
		{"http://", ""},
		{"//", ""},
	}
	for _, c := range cases {
		if got := Host(c.raw); got != c.want {
			t.Errorf("Host(%q) = %q; want %q", c.raw, got, c.want)
		}
	}
}

// TestRegistrableDomain — pinning the eTLD+1 heuristic, including the
// explicit second-level-ccTLD table that keeps multi-segment suffixes
// (co.uk, com.tw) from collapsing to the bare suffix.
func TestRegistrableDomain(t *testing.T) {
	cases := []struct {
		raw, want string
	}{
		{"flyto2.com", "flyto2.com"},
		{"mail.flyto2.com", "flyto2.com"},
		{"a.b.c.flyto2.com", "flyto2.com"},
		{"https://foo.com/x", "foo.com"},
		{"single", "single"},
		// Multi-segment ccTLDs resolve to the real registrable domain
		// via the second-level-ccTLD table (not the bare suffix).
		{"www.example.co.uk", "example.co.uk"},
		{"co.uk", "co.uk"},
		{"taishinbank.com.tw", "taishinbank.com.tw"},
		{"api.taishinbank.com.tw", "taishinbank.com.tw"},
		{"api.nanshanlife.com.tw", "nanshanlife.com.tw"},
		{"api.example.co.jp", "example.co.jp"},
		{"mail.example.co.kr", "example.co.kr"},
		{"shop.example.co.nz", "example.co.nz"},
		{"login.example.com.au", "example.com.au"},
		{"portal.example.com.hk", "example.com.hk"},
		{"vpn.example.com.sg", "example.com.sg"},
	}
	for _, c := range cases {
		if got := RegistrableDomain(c.raw); got != c.want {
			t.Errorf("RegistrableDomain(%q) = %q; want %q", c.raw, got, c.want)
		}
	}
}

// TestUnknownType_FallsThroughToLowercaseTrim — defensive default
// for type values not in the switch. Better to safe-normalise than
// silently store the raw string.
func TestUnknownType_FallsThroughToLowercaseTrim(t *testing.T) {
	got := For("some_unknown_type", "  Foo  ")
	if got != "foo" {
		t.Errorf("For(unknown, '  Foo  ') = %q; want 'foo'", got)
	}
}

// TestCloudTypes_ProviderCanonicaliserOwnsCase pins the PR-4B contract: the
// kernel must NOT re-fold the case of cloud_resource / cloud_network /
// cloud_identity values, because the provider canonicaliser
// (internal/cloudscan) already applied component-level case rules (e.g.
// Lambda function names + GCP resource names are case-preserved). Re-folding
// here would split/collapse cloud identity wrongly. cloud_account is the one
// cloud type safe to lowercase (locators have no case-sensitive component).
func TestCloudTypes_ProviderCanonicaliserOwnsCase(t *testing.T) {
	caseSensitive := map[string]string{
		"cloud_resource": "gcp-selflink:https://compute.googleapis.com/v1/projects/foo/zones/us-east1-b/instances/MyInstance",
		"cloud_network":  "azure-rid:/subscriptions/abc/providers/microsoft.network/virtualnetworks/MyVNet",
		"cloud_identity": "aws:123456789012/role/AdminRole", // not lowercased BY THE KERNEL (AWS canonicaliser already did)
	}
	for typ, in := range caseSensitive {
		if got := For(typ, "  "+in+"  "); got != in {
			t.Errorf("For(%q) = %q; want %q unchanged (whitespace-trim only, no case fold)", typ, got, in)
		}
	}

	// cloud_account is lowercase-safe.
	if got := For("cloud_account", "  AWS:123456789012  "); got != "aws:123456789012" {
		t.Errorf("For(cloud_account) = %q; want lowercased 'aws:123456789012'", got)
	}
}

func TestStripScheme(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"https://x.com", "x.com"},
		{"http://x.com", "x.com"},
		{"//x.com", "x.com"},
		{"x.com", "x.com"},
		{"", ""},
	}
	for _, c := range cases {
		if got := StripScheme(c.raw); got != c.want {
			t.Errorf("StripScheme(%q) = %q; want %q", c.raw, got, c.want)
		}
	}
}
