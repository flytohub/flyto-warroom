package identityscore

import (
	"testing"
	"time"
)

func boolp(b bool) *bool { return &b }

func timep(t time.Time) *time.Time { return &t }

func TestScoreNoMFA(t *testing.T) {
	cases := []struct {
		name    string
		in      *bool
		wantSev Severity
		wantMsg string // "" means "don't care, just assert no/empty reason"
	}{
		{"enrolled true → ok", boolp(true), SeverityNone, ""},
		{"enrolled false → risk", boolp(false), SeverityHigh, "no MFA"},
		{"unknown (nil) → risk", nil, SeverityHigh, "MFA enrolment unknown"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScoreNoMFA(c.in)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev == SeverityNone && reason != "" {
				t.Errorf("ok signal should carry no reason, got %q", reason)
			}
			if c.wantMsg != "" && reason != c.wantMsg {
				t.Errorf("reason = %q, want %q", reason, c.wantMsg)
			}
		})
	}
}

func TestScoreBadStatus(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		wantSev Severity
		wantMsg string
	}{
		{"active → ok", "active", SeverityNone, ""},
		{"ACTIVE (case-insensitive) → ok", "ACTIVE", SeverityNone, ""},
		{"empty (no claim) → ok/unscored", "", SeverityNone, ""},
		{"suspended → risk", "suspended", SeverityHigh, "status=suspended"},
		{"deprovisioned → risk", "deprovisioned", SeverityHigh, "status=deprovisioned"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScoreBadStatus(c.in)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev == SeverityNone && reason != "" {
				t.Errorf("ok signal should carry no reason, got %q", reason)
			}
			if c.wantMsg != "" && reason != c.wantMsg {
				t.Errorf("reason = %q, want %q", reason, c.wantMsg)
			}
		})
	}
}

func TestIdentitySignal_IsAtRisk(t *testing.T) {
	cases := []struct {
		name string
		sig  IdentitySignal
		want bool
	}{
		{"mfa ok + active → safe", IdentitySignal{MFAEnrolled: boolp(true), Status: "active"}, false},
		{"no mfa + active → risk", IdentitySignal{MFAEnrolled: boolp(false), Status: "active"}, true},
		{"mfa ok + suspended → risk", IdentitySignal{MFAEnrolled: boolp(true), Status: "suspended"}, true},
		{"unknown mfa + active → risk", IdentitySignal{MFAEnrolled: nil, Status: "active"}, true},
		{"no mfa + suspended → risk", IdentitySignal{MFAEnrolled: boolp(false), Status: "suspended"}, true},
		{"mfa ok + no status claim → safe", IdentitySignal{MFAEnrolled: boolp(true), Status: ""}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.sig.IsAtRisk(); got != c.want {
				t.Errorf("IsAtRisk() = %v, want %v", got, c.want)
			}
		})
	}
}

func TestScoreStale(t *testing.T) {
	now := time.Date(2026, 6, 4, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name      string
		lastLogin *time.Time
		threshold int
		wantSev   Severity
	}{
		{"nil last login → unscored", nil, 90, SeverityNone},
		{"threshold 0 (disabled) → unscored", timep(now.AddDate(0, 0, -1000)), 0, SeverityNone},
		{"fresh login → ok", timep(now.AddDate(0, 0, -10)), 90, SeverityNone},
		{"one day under threshold → ok", timep(now.AddDate(0, 0, -89)), 90, SeverityNone},
		{"exactly at threshold → stale (inclusive boundary)", timep(now.AddDate(0, 0, -90)), 90, SeverityMedium},
		{"well past threshold → stale", timep(now.AddDate(0, 0, -200)), 90, SeverityMedium},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScoreStale(c.lastLogin, now, c.threshold)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev == SeverityNone && reason != "" {
				t.Errorf("no-risk should carry no reason, got %q", reason)
			}
			if c.wantSev != SeverityNone && reason == "" {
				t.Errorf("risk should carry a reason")
			}
		})
	}
}

func TestScorePrivilegedNoMFA(t *testing.T) {
	cases := []struct {
		name    string
		priv    bool
		mfa     *bool
		wantSev Severity
	}{
		{"not privileged + no mfa → unscored here", false, boolp(false), SeverityNone},
		{"privileged + mfa enrolled → ok", true, boolp(true), SeverityNone},
		{"privileged + no mfa → HIGH", true, boolp(false), SeverityHigh},
		{"privileged + unknown mfa → HIGH", true, nil, SeverityHigh},
		{"not privileged + unknown mfa → unscored here", false, nil, SeverityNone},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScorePrivilegedNoMFA(c.priv, c.mfa)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev == SeverityHigh && reason == "" {
				t.Errorf("high signal should carry a reason")
			}
		})
	}
}

func TestScoreInactiveServiceAccount(t *testing.T) {
	now := time.Date(2026, 6, 4, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name      string
		kind      string
		lastLogin *time.Time
		threshold int
		wantSev   Severity
	}{
		{"human kind → never this signal", "human", timep(now.AddDate(0, 0, -365)), 30, SeverityNone},
		{"service account, nil last login → unscored", KindServiceAccount, nil, 30, SeverityNone},
		{"service account, recent → ok", KindServiceAccount, timep(now.AddDate(0, 0, -5)), 30, SeverityNone},
		{"service account, one day under → ok", KindServiceAccount, timep(now.AddDate(0, 0, -29)), 30, SeverityNone},
		{"service account, exactly threshold → inactive (inclusive)", KindServiceAccount, timep(now.AddDate(0, 0, -30)), 30, SeverityMedium},
		{"service account, long idle → inactive", KindServiceAccount, timep(now.AddDate(0, 0, -120)), 30, SeverityMedium},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScoreInactiveServiceAccount(c.kind, c.lastLogin, now, c.threshold)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev != SeverityNone && reason == "" {
				t.Errorf("risk should carry a reason")
			}
		})
	}
}

func TestScoreExternalPrivileged(t *testing.T) {
	cases := []struct {
		name     string
		external bool
		priv     bool
		wantSev  Severity
	}{
		{"internal + privileged → not this signal", false, true, SeverityNone},
		{"external + non-privileged → not this signal", true, false, SeverityNone},
		{"internal + non-privileged → ok", false, false, SeverityNone},
		{"external + privileged → MEDIUM", true, true, SeverityMedium},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sev, reason := ScoreExternalPrivileged(c.external, c.priv)
			if sev != c.wantSev {
				t.Errorf("severity = %q, want %q", sev, c.wantSev)
			}
			if c.wantSev != SeverityNone && reason == "" {
				t.Errorf("risk should carry a reason")
			}
		})
	}
}
