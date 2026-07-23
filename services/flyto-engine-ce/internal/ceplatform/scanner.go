package ceplatform

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	maxScanFiles    = 20000
	maxFindingCount = 1000
	maxFileBytes    = 2 << 20
)

type scanRule struct {
	ID          string
	Category    string
	Severity    string
	Title       string
	Detail      string
	Pattern     *regexp.Regexp
	FilePattern *regexp.Regexp
}

var ceScanRules = []scanRule{
	{ID: "secret.private-key", Category: "secret", Severity: "critical", Title: "Private key committed to source", Detail: "Remove the private key, rotate the credential, and purge it from repository history.", Pattern: regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----`)},
	{ID: "secret.aws-access-key", Category: "secret", Severity: "critical", Title: "AWS access key identifier in source", Detail: "Disable and rotate the AWS credential; use a secret manager or workload identity.", Pattern: regexp.MustCompile(`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`)},
	{ID: "secret.github-token", Category: "secret", Severity: "critical", Title: "GitHub token in source", Detail: "Revoke the token and replace it with a scoped secret supplied at runtime.", Pattern: regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{20,255}\b`)},
	{ID: "secret.slack-token", Category: "secret", Severity: "high", Title: "Slack token in source", Detail: "Revoke the token and load the replacement from a runtime secret store.", Pattern: regexp.MustCompile(`\bxox[baprs]-[A-Za-z0-9-]{10,255}\b`)},
	{ID: "iac.world-open-ingress", Category: "iac", Severity: "high", Title: "Network ingress is open to the world", Detail: "Restrict the ingress CIDR and document the minimum required source ranges.", Pattern: regexp.MustCompile(`(?i)(?:cidr_blocks|source_ranges|source_address_prefix)\s*[:=].*0\.0\.0\.0/0`)},
	{ID: "iac.privileged-container", Category: "iac", Severity: "high", Title: "Container runs in privileged mode", Detail: "Disable privileged mode and grant only the specific Linux capabilities required.", Pattern: regexp.MustCompile(`(?i)privileged\s*:\s*true`)},
	{ID: "iac.public-read", Category: "iac", Severity: "high", Title: "Storage resource allows public read", Detail: "Remove public ACLs and expose only explicitly approved objects through a controlled endpoint.", Pattern: regexp.MustCompile(`(?i)(?:public-read|allUsers\s*:\s*(?:READER|objectViewer))`)},
	{ID: "iac.tls-verification-disabled", Category: "iac", Severity: "medium", Title: "TLS certificate verification is disabled", Detail: "Enable certificate verification and configure the correct trust bundle.", Pattern: regexp.MustCompile(`(?i)(?:(?:verify_ssl|tls_verify)\s*[:=]\s*false|insecure_skip_verify\s*[:=]\s*true)`)},
	{ID: "sast.python-shell-true", Category: "sast", Severity: "high", Title: "Subprocess executes through a shell", Detail: "Pass an argument vector without shell=True and validate all external input.", Pattern: regexp.MustCompile(`(?:subprocess\.(?:run|call|Popen)|check_output)\([^\n]*shell\s*=\s*True`)},
	{ID: "sast.javascript-eval", Category: "sast", Severity: "high", Title: "Dynamic JavaScript evaluation", Detail: "Replace eval with a typed parser or an explicit command dispatch table.", Pattern: regexp.MustCompile(`\beval\s*\(`), FilePattern: regexp.MustCompile(`\.(?:js|jsx|ts|tsx|mjs|cjs)$`)},
	{ID: "sast.react-raw-html", Category: "sast", Severity: "medium", Title: "Raw HTML injection sink", Detail: "Sanitize untrusted HTML with a maintained allowlist sanitizer before rendering.", Pattern: regexp.MustCompile(`dangerouslySetInnerHTML`)},
	{ID: "sast.go-tls-insecure", Category: "sast", Severity: "high", Title: "Go TLS verification disabled", Detail: "Remove InsecureSkipVerify and configure a trusted certificate pool.", Pattern: regexp.MustCompile(`InsecureSkipVerify\s*:\s*true`), FilePattern: regexp.MustCompile(`\.go$`)},
	{ID: "supply-chain.local-replace", Category: "dependency", Severity: "medium", Title: "Go module replacement points outside the module", Detail: "Remove local filesystem replacements before release so builds remain reproducible.", Pattern: regexp.MustCompile(`^\s*replace\s+\S+\s+=>\s+(?:\.\.?/|/)`), FilePattern: regexp.MustCompile(`(?:^|/)go\.mod$`)},
}

var ignoredDirectories = map[string]bool{
	".git": true, ".hg": true, ".svn": true, "node_modules": true,
	"vendor": true, "dist": true, "build": true, ".next": true,
	"coverage": true, ".cache": true, ".venv": true, "venv": true,
}

func ScanDirectory(ctx context.Context, root, projectID, repoID, scanID string) ([]Finding, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	findings := make([]Finding, 0, 32)
	files := 0
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if entry.IsDir() {
			if path != root && ignoredDirectories[entry.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		files++
		if files > maxScanFiles {
			return errors.New("repository exceeds CE scan file limit")
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Size() > maxFileBytes || info.Size() == 0 {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		reader := bufio.NewReader(io.LimitReader(file, maxFileBytes+1))
		lineNo := 0
		for {
			line, readErr := reader.ReadString('\n')
			lineNo++
			if strings.IndexByte(line, 0) >= 0 {
				return nil
			}
			for _, rule := range ceScanRules {
				if rule.FilePattern != nil && !rule.FilePattern.MatchString(filepath.ToSlash(rel)) {
					continue
				}
				if !rule.Pattern.MatchString(line) {
					continue
				}
				fingerprintRaw := sha256.Sum256([]byte(rule.ID + "\x00" + filepath.ToSlash(rel) + "\x00" + strings.TrimSpace(line)))
				findings = append(findings, Finding{
					ID: NewID("finding"), ScanID: scanID, OrgID: projectID, RepoID: repoID,
					Category: rule.Category, Severity: rule.Severity, RuleID: rule.ID,
					Name: rule.Title, File: filepath.ToSlash(rel), Line: lineNo,
					Detail: rule.Detail, Fingerprint: hex.EncodeToString(fingerprintRaw[:]), CreatedAt: time.Now().UTC(),
				})
				if len(findings) >= maxFindingCount {
					return errors.New("repository exceeds CE finding limit")
				}
			}
			if errors.Is(readErr, io.EOF) {
				break
			}
			if readErr != nil {
				return readErr
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return findings, nil
}
