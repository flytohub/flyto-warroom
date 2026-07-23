package ceplatform

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestScanDirectoryFindsRealIssuesWithoutReturningSecretValue(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "main.tf")
	content := "cidr_blocks = [\"0.0.0.0/0\"]\nkey = \"AKIAABCDEFGHIJKLMNOP\"\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	findings, err := ScanDirectory(context.Background(), root, "org", "repo", "scan")
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 2 {
		t.Fatalf("findings=%d, want 2: %#v", len(findings), findings)
	}
	for _, finding := range findings {
		if finding.File != "main.tf" || finding.Line < 1 || finding.Fingerprint == "" {
			t.Fatalf("incomplete finding: %#v", finding)
		}
		if finding.Detail == "AKIAABCDEFGHIJKLMNOP" {
			t.Fatal("secret value leaked into finding detail")
		}
	}
}

func TestValidatePublicCloneURL(t *testing.T) {
	for _, raw := range []string{"http://github.com/a/b", "https://user:pass@flyto2.com/a/b", "https://127.0.0.1/a/b", "file:///tmp/repo"} {
		if err := ValidatePublicCloneURL(raw); err == nil {
			t.Fatalf("accepted unsafe URL %q", raw)
		}
	}
	if err := ValidatePublicCloneURL("https://github.com/flytohub/flyto-core.git"); err != nil {
		t.Fatal(err)
	}
}
