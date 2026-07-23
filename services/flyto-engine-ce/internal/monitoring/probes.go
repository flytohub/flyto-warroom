// Package monitoring provides lightweight probes for continuous security
// monitoring between full discovery scans. Each probe does a single
// network check (TLS dial, DNS lookup, TCP connect) and returns a
// structured change event if the state differs from the previous scan.
package monitoring

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"sort"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/safehttp"
)

// CertResult holds the outcome of a certificate expiry check.
type CertResult struct {
	Domain   string
	NotAfter time.Time
	Issuer   string
	DaysLeft int
	Error    string
}

// CheckCertExpiry performs a TLS dial to the domain and reads the
// leaf certificate's expiry. Timeout: 10 seconds.
//
// SSRF guard: refuses to dial any host that resolves to a private /
// loopback / cloud-metadata address. Without this, a customer who set
// their monitored domain to `localhost` or `metadata.google.internal`
// would have the engine probing its own infrastructure.
func CheckCertExpiry(ctx context.Context, domain string) CertResult {
	r := CertResult{Domain: domain}
	if err := safehttp.ValidateHost(ctx, domain); err != nil {
		r.Error = err.Error()
		return r
	}
	dialer := &tls.Dialer{
		Config: &tls.Config{InsecureSkipVerify: true},
	}
	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	conn, err := dialer.DialContext(ctx2, "tcp", domain+":443")
	if err != nil {
		r.Error = err.Error()
		return r
	}
	defer conn.Close()

	tlsConn := conn.(*tls.Conn)
	certs := tlsConn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		r.Error = "no certificates"
		return r
	}
	leaf := certs[0]
	r.NotAfter = leaf.NotAfter
	r.Issuer = leaf.Issuer.CommonName
	r.DaysLeft = int(time.Until(leaf.NotAfter).Hours() / 24)
	return r
}

// DNSResult holds DNS record query results.
type DNSResult struct {
	Domain string
	A      []string // A records (IPs)
	MX     []string // MX hosts
	NS     []string // NS hosts
	TXT    []string // TXT records (truncated)
	Error  string
}

// CheckDNSRecords resolves A, MX, NS, and key TXT records for a domain.
func CheckDNSRecords(ctx context.Context, domain string) DNSResult {
	r := DNSResult{Domain: domain}
	resolver := &net.Resolver{PreferGo: true}

	ctx2, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// A records
	ips, err := resolver.LookupHost(ctx2, domain)
	if err == nil {
		sort.Strings(ips)
		r.A = ips
	}

	// MX records
	mxs, err := resolver.LookupMX(ctx2, domain)
	if err == nil {
		for _, mx := range mxs {
			r.MX = append(r.MX, mx.Host)
		}
		sort.Strings(r.MX)
	}

	// NS records
	nss, err := resolver.LookupNS(ctx2, domain)
	if err == nil {
		for _, ns := range nss {
			r.NS = append(r.NS, ns.Host)
		}
		sort.Strings(r.NS)
	}

	// TXT records (SPF, DMARC, DKIM selectors)
	txts, err := resolver.LookupTXT(ctx2, domain)
	if err == nil {
		for _, txt := range txts {
			if strings.HasPrefix(txt, "v=spf") || strings.HasPrefix(txt, "v=DMARC") ||
				strings.HasPrefix(txt, "v=DKIM") || strings.Contains(txt, "google-site") {
				r.TXT = append(r.TXT, txt)
			}
		}
		sort.Strings(r.TXT)
	}

	return r
}

// PortResult holds TCP port probe results.
type PortResult struct {
	Host      string
	OpenPorts []int
	Error     string
}

// CheckPorts probes a list of common ports via TCP connect with a 3s timeout.
//
// SSRF guard: refuses to probe any host that resolves to a private /
// loopback / cloud-metadata address. CheckPorts hits a 20-port list
// covering SSH, MySQL, PostgreSQL, Redis, etc. — exactly the services
// an attacker would want enumerated on our internal network if they
// could trick us into scanning `127.0.0.1` or `10.0.0.1`.
func CheckPorts(ctx context.Context, host string) PortResult {
	commonPorts := []int{21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995,
		3306, 3389, 5432, 6379, 8080, 8443, 9200, 27017}

	r := PortResult{Host: host}
	if err := safehttp.ValidateHost(ctx, host); err != nil {
		r.Error = err.Error()
		return r
	}
	for _, port := range commonPorts {
		addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
		conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
		if err == nil {
			conn.Close()
			r.OpenPorts = append(r.OpenPorts, port)
		}
	}
	sort.Ints(r.OpenPorts)
	return r
}

// Subdomain enumeration for monitoring lives in api/handlers_discovery_dns.go
// (cache-backed). The earlier in-package `CheckNewSubdomains` probe was
// never called and was removed to avoid a second un-cached crt.sh path.
