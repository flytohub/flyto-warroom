// Package safehttp provides SSRF guards for outbound HTTP calls that
// touch user-controlled URLs or hostnames.
//
// Internal call sites that hit fixed third-party APIs (api.github.com,
// api.openai.com, abuse.ch feeds) do NOT need these guards — the host
// is hardcoded and not attacker-influenced. Use safehttp.* only where
// the URL or host comes from:
//
//   - pentest project target_url
//   - attack-surface domain/port probes
//   - webhook delivery (org-configured URLs)
//   - any caller passing data the user supplied via HTTP
//
// The guard checks two things:
//
//  1. The host resolves to a *public* IP — never loopback, link-local,
//     RFC1918 private space, CGNAT, or IPv6 ULA / link-local.
//  2. The cloud metadata endpoints (169.254.169.254, fd00:ec2::254,
//     metadata.google.internal, metadata.azure.com) are blocked even
//     if the host would otherwise resolve to a public IP.
//
// To bypass for trusted internal targets (e.g. flyto-runner at
// http://runner:8090 inside the docker network), do not call safehttp.
// SSRF guards are for user-supplied destinations only.
package safehttp

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrPrivateHost is returned when the target host resolves to a private,
// loopback, link-local, or otherwise non-public IP address. Callers that
// want to allow internal targets in test environments should check this
// error explicitly.
var ErrPrivateHost = errors.New("safehttp: target resolves to private/internal address")

// ErrMetadataHost is returned when the host matches one of the cloud
// metadata endpoints. These are always blocked regardless of IP scope
// because they expose IAM credentials.
var ErrMetadataHost = errors.New("safehttp: cloud metadata host blocked")

// ErrInvalidHost is returned when the host string is malformed.
var ErrInvalidHost = errors.New("safehttp: invalid host")

// blockedHosts is checked verbatim against the URL host. Use lowercase
// keys; matching is case-insensitive at the call site.
var blockedHosts = map[string]struct{}{
	"metadata.google.internal": {},
	"metadata":                 {},
	"metadata.azure.com":       {},
	"169.254.169.254":          {},
	"[fd00:ec2::254]":          {},
	"fd00:ec2::254":            {},
	"100.100.100.200":          {}, // Alibaba Cloud metadata
}

// privateBlocks lists CIDR ranges we refuse to talk to. Includes:
//   - IPv4: loopback, link-local, RFC1918, CGNAT, multicast, broadcast
//   - IPv6: loopback, unspecified, link-local, ULA, IPv4-mapped private
var privateBlocks = func() []*net.IPNet {
	cidrs := []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC1918
		"172.16.0.0/12",  // RFC1918
		"192.168.0.0/16", // RFC1918
		"169.254.0.0/16", // link-local + cloud metadata
		"100.64.0.0/10",  // CGNAT (RFC6598)
		"0.0.0.0/8",      // "this" network
		"224.0.0.0/4",    // multicast
		"240.0.0.0/4",    // reserved
		"::1/128",        // IPv6 loopback
		"::/128",         // IPv6 unspecified
		"fe80::/10",      // IPv6 link-local
		"fc00::/7",       // IPv6 ULA
		"ff00::/8",       // IPv6 multicast
	}
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic(fmt.Sprintf("safehttp: bad CIDR %q: %v", c, err))
		}
		out = append(out, n)
	}
	return out
}()

// IsPrivateIP reports whether ip lies inside any blocked CIDR range.
func IsPrivateIP(ip net.IP) bool {
	if ip == nil {
		return true // refuse on uncertainty
	}
	for _, block := range privateBlocks {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateHost checks a single hostname or IP literal. Returns nil if
// the host is safe to contact, otherwise an explanatory error.
//
// The host must be just the host portion — no scheme, no port. Use
// ValidateURL for full URL strings.
//
// DNS resolution happens here, with a 5-second cap so a malicious
// resolver can't stall callers indefinitely. If the host resolves to
// multiple addresses (round-robin DNS), every address must be public —
// a single private result fails the whole check, since the OS dialer
// may pick that address.
func ValidateHost(ctx context.Context, host string) error {
	host = strings.TrimSpace(host)
	if host == "" {
		return fmt.Errorf("%w: empty host", ErrInvalidHost)
	}
	lower := strings.ToLower(host)
	if _, blocked := blockedHosts[lower]; blocked {
		return ErrMetadataHost
	}
	// Strip IPv6 brackets that survived the URL parser, just in case.
	stripped := strings.TrimPrefix(strings.TrimSuffix(lower, "]"), "[")
	if _, blocked := blockedHosts[stripped]; blocked {
		return ErrMetadataHost
	}

	// Fast path: host is already an IP literal.
	if ip := net.ParseIP(stripped); ip != nil {
		if IsPrivateIP(ip) {
			return fmt.Errorf("%w: %s", ErrPrivateHost, ip)
		}
		return nil
	}

	// DNS resolution with timeout.
	ctx2, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	resolver := &net.Resolver{PreferGo: true}
	addrs, err := resolver.LookupHost(ctx2, host)
	if err != nil {
		return fmt.Errorf("%w: dns lookup: %v", ErrInvalidHost, err)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("%w: no DNS records", ErrInvalidHost)
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip == nil || IsPrivateIP(ip) {
			return fmt.Errorf("%w: %s → %s", ErrPrivateHost, host, addr)
		}
	}
	return nil
}

// ValidateURL parses rawURL and validates the host portion against the
// SSRF policy. Schemes other than http(s) are rejected outright so a
// caller can't smuggle in file://, gopher://, or jar://.
func ValidateURL(ctx context.Context, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("%w: parse: %v", ErrInvalidHost, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: scheme %q not allowed", ErrInvalidHost, u.Scheme)
	}
	host := u.Hostname()
	return ValidateHost(ctx, host)
}

// lookupIPAddr resolves a host to its IP addresses. It is a package var so
// tests can stub DNS without hitting the network (mirroring how callers stub
// dialers/resolvers elsewhere). Production points at the system resolver.
var lookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
	return net.DefaultResolver.LookupIPAddr(ctx, host)
}

// SetResolverForTest overrides the DNS resolver used by the guarded client and
// returns a restore func. It exists so callers in OTHER packages (e.g. footprint
// connector tests) can deterministically pin a host to a private/public IP and
// exercise the dial-time SSRF veto without real DNS. Use only in tests.
func SetResolverForTest(fn func(ctx context.Context, host string) ([]net.IPAddr, error)) (restore func()) {
	prev := lookupIPAddr
	lookupIPAddr = fn
	return func() { lookupIPAddr = prev }
}

// NewClient returns an *http.Client hardened against SSRF for outbound calls
// whose destination URL or host is user-controlled (OSINT/discovery fetches of
// `https://<user-host>`, scraped child URLs, etc).
//
// It defends against DNS rebinding / TOCTOU: rather than validating the URL
// once at request build time, the custom DialContext re-resolves the host at
// the moment of connection and refuses to dial if ANY candidate address is
// private/loopback/link-local/metadata. The actual public IP we vetted is the
// one we dial, so a resolver can't hand us a public answer for the check and a
// private one for the connection.
//
// Redirects are disabled — a 302 to 169.254.169.254 is the canonical SSRF
// amplifier and a footprint/discovery probe never legitimately needs to follow
// one. Callers that must observe the redirect target read the response of the
// (un-followed) 3xx directly.
//
// Use this anywhere you would otherwise reach for httpx.New on an
// attacker-influenced host. Fixed third-party hosts (api.github.com,
// web.archive.org, rdap.org, …) do NOT need it — the host isn't controllable.
func NewClient(timeout time.Duration) *http.Client {
	c := newGuardedClient(timeout)
	// Refuse redirects entirely — a 302 → 169.254.169.254 is the canonical
	// SSRF amplifier, and probes that want to OBSERVE a 3xx read the un-followed
	// response directly. Use NewRedirectClient for crawlers that legitimately
	// follow apex→www style redirects (those hops stay dial-time guarded).
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return c
}

// NewRedirectClient is like NewClient but follows up to maxRedirects hops
// instead of refusing them. Every hop is still dial-time guarded by the same
// transport, so a redirect to a private/metadata address is rejected at
// connection time — the SSRF amplifier is closed without breaking legitimate
// public redirects (e.g. http→https, apex→www) that recon crawlers depend on.
//
// maxRedirects <= 0 falls back to a sane default of 5.
func NewRedirectClient(timeout time.Duration, maxRedirects int) *http.Client {
	if maxRedirects <= 0 {
		maxRedirects = 5
	}
	c := newGuardedClient(timeout)
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			return http.ErrUseLastResponse
		}
		return nil
	}
	return c
}

// newGuardedClient builds an *http.Client whose transport re-resolves and
// vetoes private/metadata addresses at dial time. Redirect policy is left to
// the caller (NewClient / NewRedirectClient set CheckRedirect).
func newGuardedClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	// Capture the resolver once at construction so an in-flight dial reads a
	// stable function value rather than the package var. Tests swap lookupIPAddr
	// and restore it in t.Cleanup; a dial goroutine that outlives the test (e.g.
	// a connect to a black-hole public IP) would otherwise data-race the restore.
	resolve := lookupIPAddr
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			// Block metadata hostnames (and IPv6-bracketed metadata) up front;
			// these never resolve to anything we want to dial.
			if _, blocked := blockedHosts[strings.ToLower(host)]; blocked {
				return nil, fmt.Errorf("%w: %s", ErrMetadataHost, host)
			}
			ips, err := resolve(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("%w: dns lookup: %v", ErrInvalidHost, err)
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("%w: no addresses for %s", ErrInvalidHost, host)
			}
			for _, ipa := range ips {
				if IsPrivateIP(ipa.IP) {
					return nil, fmt.Errorf("%w: %s → %s", ErrPrivateHost, host, ipa.IP)
				}
			}
			// Dial the first vetted address directly so a second DNS lookup
			// can't rebind between the check and the connection.
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
}
