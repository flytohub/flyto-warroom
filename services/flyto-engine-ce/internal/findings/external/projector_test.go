package external

import (
	"reflect"
	"sort"
	"testing"
)

// findingKeys is a test-only helper: returns the stable IDs of a
// finding slice, sorted, so we can compare two projector outputs
// without caring about ordering. Evidence + descriptions are
// checked separately in individual sub-tests.
func findingKeys(fs []Finding) []string {
	out := make([]string, len(fs))
	for i, f := range fs {
		out[i] = f.ID
	}
	sort.Strings(out)
	return out
}

func TestProjectHTTP(t *testing.T) {
	t.Run("https with everything missing → all 5 header-class findings", func(t *testing.T) {
		// Empty headers map → fires all five header-presence checks.
		out := Project("http_endpoint", `{"scheme":"https","headers":{}}`)
		want := []string{
			"http:clickjacking", "http:csp_not_set", "http:hsts_not_set",
			"http:no_sniff",
		}
		// Note: server / powered_by leaks don't fire when headers
		// are empty — those are presence checks, not absence checks.
		got := findingKeys(out)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("expected %v, got %v", want, got)
		}
	})

	t.Run("https with secure headers → no findings", func(t *testing.T) {
		md := `{"scheme":"https","headers":{
			"Strict-Transport-Security":"max-age=31536000",
			"Content-Security-Policy":"default-src 'self'",
			"X-Content-Type-Options":"nosniff",
			"X-Frame-Options":"DENY"
		}}`
		out := Project("http_endpoint", md)
		if len(out) != 0 {
			t.Errorf("secure server should produce no findings, got %v", findingKeys(out))
		}
	})

	t.Run("CSP frame-ancestors satisfies clickjacking", func(t *testing.T) {
		// Has CSP frame-ancestors directive → no clickjacking even
		// without X-Frame-Options, mirroring frontend's substring
		// check.
		md := `{"scheme":"https","headers":{
			"Strict-Transport-Security":"max-age=31536000",
			"Content-Security-Policy":"frame-ancestors 'self'",
			"X-Content-Type-Options":"nosniff"
		}}`
		out := Project("http_endpoint", md)
		for _, f := range out {
			if f.ID == "http:clickjacking" {
				t.Errorf("frame-ancestors directive should suppress clickjacking, got %+v", f)
			}
		}
	})

	t.Run("server header value flows into evidence", func(t *testing.T) {
		md := `{"scheme":"https","headers":{
			"Strict-Transport-Security":"max-age=31536000",
			"Content-Security-Policy":"default-src 'self'",
			"X-Content-Type-Options":"nosniff",
			"X-Frame-Options":"DENY",
			"Server":"nginx/1.18.0"
		}}`
		out := Project("http_endpoint", md)
		var leak *Finding
		for i := range out {
			if out[i].ID == "http:server_leak" {
				leak = &out[i]
			}
		}
		if leak == nil {
			t.Fatal("expected server_leak finding")
		}
		if leak.Severity != "LOW" {
			t.Errorf("server_leak severity should be LOW, got %s", leak.Severity)
		}
		if v, _ := leak.Evidence["server"].(string); v != "nginx/1.18.0" {
			t.Errorf("evidence.server should carry header value, got %v", leak.Evidence)
		}
	})

	t.Run("plain http with non-redirect status fires http_only", func(t *testing.T) {
		out := Project("http_endpoint", `{"scheme":"http","status":200}`)
		if len(out) != 1 || out[0].ID != "http:http_only" {
			t.Errorf("plain http 200 should flag http_only, got %+v", out)
		}
		// Status came from a typed int field on httpMeta, so the
		// evidence value is a real int (not float64 like a raw
		// unmarshal would give).
		if v, _ := out[0].Evidence["status"].(int); v != 200 {
			t.Errorf("evidence.status should be 200, got %v", out[0].Evidence)
		}
	})

	t.Run("plain http with 301 redirect → no finding", func(t *testing.T) {
		out := Project("http_endpoint", `{"scheme":"http","status":301}`)
		if len(out) != 0 {
			t.Errorf("301 redirect to https is fine, got %v", findingKeys(out))
		}
	})

	t.Run("empty / unparseable metadata returns nil", func(t *testing.T) {
		if r := Project("http_endpoint", ""); r != nil {
			t.Errorf("empty metadata should return nil, got %v", r)
		}
		if r := Project("http_endpoint", "{not json"); r != nil {
			t.Errorf("invalid JSON should return nil, got %v", r)
		}
	})
}

func TestProjectDNS(t *testing.T) {
	t.Run("all flags missing → SPF + DMARC + DNSSEC fire", func(t *testing.T) {
		// caa field absent (nil) — must NOT fire the no_caa finding
		// (matches frontend `m.caa === false` strict check).
		out := Project("dns_security", `{}`)
		got := findingKeys(out)
		want := []string{"dns:no_dmarc", "dns:no_dnssec", "dns:no_spf"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("expected %v, got %v", want, got)
		}
	})

	t.Run("explicit caa:false fires no_caa, caa:true silent", func(t *testing.T) {
		// All other flags true so we isolate the CAA branch.
		out := Project("dns_security", `{"spf":true,"dmarc":true,"dnssec":true,"caa":false}`)
		if len(out) != 1 || out[0].ID != "dns:no_caa" {
			t.Errorf("caa:false should fire alone, got %v", findingKeys(out))
		}
		out = Project("dns_security", `{"spf":true,"dmarc":true,"dnssec":true,"caa":true}`)
		if len(out) != 0 {
			t.Errorf("caa:true should be silent, got %v", findingKeys(out))
		}
	})

	t.Run("axfr_vulnerable fires HIGH", func(t *testing.T) {
		out := Project("dns_security",
			`{"spf":true,"dmarc":true,"dnssec":true,"axfr_vulnerable":true}`)
		var axfr *Finding
		for i := range out {
			if out[i].ID == "dns:axfr_vulnerable" {
				axfr = &out[i]
			}
		}
		if axfr == nil {
			t.Fatal("expected axfr_vulnerable")
		}
		if axfr.Severity != "HIGH" {
			t.Errorf("axfr severity should be HIGH, got %s", axfr.Severity)
		}
	})
}

func TestProjectPorts(t *testing.T) {
	t.Run("safe ports (80, 443, 8080) produce no findings", func(t *testing.T) {
		out := Project("port_scan", `{"open_ports":[
			{"port":80,"service":"http"},
			{"port":443,"service":"https"},
			{"port":8080,"service":"http-alt"}
		]}`)
		if len(out) != 0 {
			t.Errorf("safe ports should not flag, got %v", findingKeys(out))
		}
	})

	t.Run("redis on 6379 → CRITICAL with port+service evidence", func(t *testing.T) {
		out := Project("port_scan",
			`{"open_ports":[{"port":6379,"service":"redis"}]}`)
		if len(out) != 1 {
			t.Fatalf("expected 1 finding, got %d", len(out))
		}
		if out[0].Severity != "CRITICAL" {
			t.Errorf("redis severity should be CRITICAL, got %s", out[0].Severity)
		}
		port, _ := out[0].Evidence["port"].(int)
		if port != 6379 {
			t.Errorf("evidence.port should be 6379, got %v", out[0].Evidence)
		}
		if out[0].Evidence["service"] != "redis" {
			t.Errorf("evidence.service should be redis, got %v", out[0].Evidence)
		}
	})

	t.Run("ssh + smb on dangerous-but-not-critical → HIGH", func(t *testing.T) {
		// 21 (FTP), 23 (telnet), 25 (SMTP), 445 (SMB), 3389 (RDP),
		// 5900 (VNC) → dangerous but not data-store-critical.
		out := Project("port_scan",
			`{"open_ports":[{"port":3389,"service":"rdp"}]}`)
		if len(out) != 1 || out[0].Severity != "HIGH" {
			t.Errorf("RDP severity should be HIGH, got %v", out)
		}
	})

	t.Run("multi-port output is sorted deterministically", func(t *testing.T) {
		// Scanner-order shuffled — projector must sort by port to
		// stabilise rendering.
		out := Project("port_scan", `{"open_ports":[
			{"port":6379,"service":"redis"},
			{"port":21,"service":"ftp"},
			{"port":3306,"service":"mysql"}
		]}`)
		got := make([]int, len(out))
		for i, f := range out {
			got[i] = int(f.Evidence["port"].(int))
		}
		want := []int{21, 3306, 6379}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("expected sorted %v, got %v", want, got)
		}
	})
}

func TestProjectSSL(t *testing.T) {
	t.Run("hsts_preload absent (nil) → no finding", func(t *testing.T) {
		// Scanner didn't determine — don't fabricate.
		if r := Project("ssl_cert", `{}`); len(r) != 0 {
			t.Errorf("hsts_preload absent should not fire, got %v", findingKeys(r))
		}
	})

	t.Run("hsts_preload:false → fires LOW", func(t *testing.T) {
		out := Project("ssl_cert", `{"hsts_preload":false}`)
		if len(out) != 1 || out[0].ID != "ssl:no_hsts_preload" {
			t.Fatalf("expected no_hsts_preload, got %v", findingKeys(out))
		}
		if out[0].Severity != "LOW" {
			t.Errorf("severity should be LOW, got %s", out[0].Severity)
		}
	})

	t.Run("hsts_preload:true → silent", func(t *testing.T) {
		if r := Project("ssl_cert", `{"hsts_preload":true}`); len(r) != 0 {
			t.Errorf("preload enabled should not fire, got %v", findingKeys(r))
		}
	})
}

func TestProjectSensitiveFiles(t *testing.T) {
	t.Run("empty file list → nil", func(t *testing.T) {
		if r := Project("sensitive_files", `{"files":[]}`); r != nil {
			t.Errorf("empty list should return nil, got %v", r)
		}
	})

	t.Run("critical + high split into two rollup findings", func(t *testing.T) {
		out := Project("sensitive_files", `{"files":[
			{"path":"/.env","risk":"critical"},
			{"path":"/.git/config","risk":"critical"},
			{"path":"/backup.zip","risk":"high"}
		]}`)
		if len(out) != 2 {
			t.Fatalf("expected critical + high rollup, got %d findings", len(out))
		}
		critIdx, highIdx := -1, -1
		for i, f := range out {
			if f.ID == "sensitive_files:critical" {
				critIdx = i
			}
			if f.ID == "sensitive_files:high" {
				highIdx = i
			}
		}
		if critIdx < 0 || highIdx < 0 {
			t.Fatalf("expected both buckets, got %v", findingKeys(out))
		}
		critFiles, _ := out[critIdx].Evidence["files"].([]string)
		if len(critFiles) != 2 {
			t.Errorf("critical bucket should list 2 paths, got %v", critFiles)
		}
		if out[critIdx].Severity != "CRITICAL" || out[highIdx].Severity != "HIGH" {
			t.Errorf("severities mismatched: %+v / %+v", out[critIdx], out[highIdx])
		}
	})

	t.Run("low-risk files alone produce nothing", func(t *testing.T) {
		// Frontend only buckets critical + high; low risk is ignored.
		out := Project("sensitive_files",
			`{"files":[{"path":"/robots.txt","risk":"low"}]}`)
		if len(out) != 0 {
			t.Errorf("low-only should not fire, got %v", findingKeys(out))
		}
	})
}

func TestProject_UnknownAssetType(t *testing.T) {
	// Subdomain identity rows, IP rows, etc. carry no finding-shaped
	// data. The projector must silently return nil rather than
	// crash the handler when encountering them.
	for _, at := range []string{"", "subdomain", "ip_address", "ssl_chain", "future_type"} {
		if r := Project(at, `{"anything":1}`); r != nil {
			t.Errorf("asset_type %q should return nil, got %v", at, r)
		}
	}
}
