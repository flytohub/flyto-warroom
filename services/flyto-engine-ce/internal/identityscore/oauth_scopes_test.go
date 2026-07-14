package identityscore

import "testing"

// TestScopeTier covers the curated scope→tier table per-scope: a representative
// scope from each tier bucket, the wildcard prefix families, and the conservative
// unknown→low fallthrough.
func TestScopeTier(t *testing.T) {
	cases := []struct {
		name  string
		scope string
		want  RiskTier
	}{
		// Google full-access → high
		{"gmail full", "https://mail.google.com/", RiskTierHigh},
		{"drive full", "https://www.googleapis.com/auth/drive", RiskTierHigh},
		{"gmail modify", "https://www.googleapis.com/auth/gmail.modify", RiskTierHigh},
		// Google read-only → medium
		{"gmail readonly", "https://www.googleapis.com/auth/gmail.readonly", RiskTierMedium},
		{"drive readonly", "https://www.googleapis.com/auth/drive.readonly", RiskTierMedium},
		{"drive.file narrow", "https://www.googleapis.com/auth/drive.file", RiskTierMedium},
		// Google identity-only → low
		{"openid", "openid", RiskTierLow},
		{"email", "email", RiskTierLow},
		{"userinfo.email", "https://www.googleapis.com/auth/userinfo.email", RiskTierLow},
		// Google admin.directory.* prefix → critical
		{"admin.directory.user", "https://www.googleapis.com/auth/admin.directory.user", RiskTierCritical},
		{"admin.directory.group readonly", "https://www.googleapis.com/auth/admin.directory.group.readonly", RiskTierCritical},
		// Microsoft Graph
		{"Mail.ReadWrite", "Mail.ReadWrite", RiskTierHigh},
		{"Files.ReadWrite.All", "Files.ReadWrite.All", RiskTierHigh},
		{"Mail.Read", "Mail.Read", RiskTierMedium},
		{"User.Read low", "User.Read", RiskTierLow},
		{"Directory.ReadWrite.All", "Directory.ReadWrite.All", RiskTierCritical},
		// Graph case-insensitive defence
		{"graph lowercased", "mail.readwrite", RiskTierHigh},
		// Okta
		{"okta.users.manage", "okta.users.manage", RiskTierCritical},
		{"okta.users.read", "okta.users.read", RiskTierHigh},
		// Unknown / unrecognised → low (conservative, not promoted)
		{"unknown scope", "https://example.com/auth/something.weird", RiskTierLow},
		{"empty scope", "", RiskTierLow},
		{"whitespace scope", "   ", RiskTierLow},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := scopeTier(c.scope); got != c.want {
				t.Errorf("scopeTier(%q) = %q, want %q", c.scope, got, c.want)
			}
		})
	}
}

// TestScoreRiskyOAuth covers the grant-level worst-of fold + severity mapping,
// including the empty-grant and multi-scope cases the task calls out.
func TestScoreRiskyOAuth(t *testing.T) {
	cases := []struct {
		name     string
		scopes   []string
		wantSev  Severity
		wantTier RiskTier
	}{
		{"full drive → high", []string{"https://www.googleapis.com/auth/drive"}, SeverityHigh, RiskTierHigh},
		{"read email → low/none", []string{"https://www.googleapis.com/auth/userinfo.email"}, SeverityNone, RiskTierLow},
		{"read-only mail → medium", []string{"https://www.googleapis.com/auth/gmail.readonly"}, SeverityMedium, RiskTierMedium},
		{"unknown → low/none", []string{"https://vendor.example/scope.x"}, SeverityNone, RiskTierLow},
		{"admin directory → critical/high sev", []string{"https://www.googleapis.com/auth/admin.directory.user"}, SeverityHigh, RiskTierCritical},
		// worst-of: low + medium + critical → critical
		{
			"worst-of multiple scopes",
			[]string{"openid", "https://www.googleapis.com/auth/gmail.readonly", "Directory.ReadWrite.All"},
			SeverityHigh, RiskTierCritical,
		},
		// worst-of: two mediums stays medium
		{
			"two reads stays medium",
			[]string{"https://www.googleapis.com/auth/gmail.readonly", "Mail.Read"},
			SeverityMedium, RiskTierMedium,
		},
		// empty grant → none/low
		{"no scopes → none", nil, SeverityNone, RiskTierLow},
		{"only blank scopes → none", []string{"", "  "}, SeverityNone, RiskTierLow},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason, tier := ScoreRiskyOAuth(c.scopes)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q (reason %q)", sev, c.wantSev, reason)
			}
			if tier != c.wantTier {
				t.Errorf("tier = %q, want %q", tier, c.wantTier)
			}
			// A scored grant must carry a non-empty reason; an unscored one must not.
			if c.wantSev != SeverityNone && reason == "" {
				t.Errorf("scored grant should have a reason, got empty")
			}
			if c.wantSev == SeverityNone && reason != "" {
				t.Errorf("unscored grant should have empty reason, got %q", reason)
			}
		})
	}
}
