package identityscore

// oauth_scopes.go — the curated OAuth-scope → risk-tier reference + the pure
// ScoreRiskyOAuth derivation (P1 Identity Security depth, slice 5).
//
// This is the static, conservative knowledge base that turns a third-party OAuth
// app's GRANTED SCOPES into a risk tier. The "risky OAuth app" attack surface is
// shadow-SaaS: a user OAuth-consents some third-party app into the org's
// Google / Microsoft / Okta tenant and hands it a token with mail-read,
// drive-wide, or directory-admin reach. The tier answers "how much blast radius
// did this consent grant?" purely from the scope strings — no I/O, no store, so
// it is shared by the store rebuild (which writes identity_oauth_grants.risk_tier)
// and any read path, and is exhaustively unit-testable.
//
// DESIGN: conservative + commented. We only PROMOTE a grant above `low` for
// scopes we can positively recognise as broad/sensitive; an UNKNOWN scope stays
// `low` (we do not invent risk we cannot justify, and a connector emitting a
// scope we have never seen must not silently inflate the tier). The tier of a
// whole grant is the WORST tier across its scopes (one critical scope makes the
// whole grant critical), mirroring how the rest of identityscore takes the most
// severe signal.

import "strings"

// RiskTier is the scope-derived risk level of an OAuth grant. Its string values
// are the SAME closed set persisted in identity_oauth_grants.risk_tier
// (migration 116 CHECK) and mirrored by store.ValidIdentityOAuthRiskTier — the
// Gate-C contract test asserts the SQL CHECK and that Go map never drift, and
// the store rebuild writes exactly these strings, so they must stay in lockstep.
type RiskTier string

const (
	// RiskTierLow — read-only / identity-only scopes (profile, email, openid) or
	// any scope we do not recognise. The default; an unknown scope lands here.
	RiskTierLow RiskTier = "low"
	// RiskTierMedium — meaningfully more than identity but not full data access:
	// read-only mail/calendar/contacts, metadata, or narrow file scopes.
	RiskTierMedium RiskTier = "medium"
	// RiskTierHigh — broad data access: full mailbox, all-of-drive, or read-write
	// across a data surface. A token here can exfiltrate or tamper with org data.
	RiskTierHigh RiskTier = "high"
	// RiskTierCritical — tenant-administrative reach: directory read-write, app
	// role assignment, or full Graph/admin scopes. A token here can escalate
	// privilege or reconfigure the tenant itself.
	RiskTierCritical RiskTier = "critical"
)

// tierRank orders tiers so "worst of" comparisons are integer comparisons.
// Higher = more severe. An empty/unknown tier ranks below low so it can never
// win a max.
func tierRank(t RiskTier) int {
	switch t {
	case RiskTierCritical:
		return 4
	case RiskTierHigh:
		return 3
	case RiskTierMedium:
		return 2
	case RiskTierLow:
		return 1
	default:
		return 0
	}
}

// worstTier returns the more severe of two tiers (ties keep a). Used to fold a
// grant's many scopes down to one tier.
func worstTier(a, b RiskTier) RiskTier {
	if tierRank(b) > tierRank(a) {
		return b
	}
	return a
}

// exactScopeTier maps a fully-qualified OAuth scope string to its tier. Keys are
// matched case-insensitively (scopes are URLs/idents that vendors emit with
// stable casing, but we normalise defensively). This table is intentionally
// CONSERVATIVE: only scopes whose breadth we can justify appear; everything else
// falls through to prefixTier and then to low.
//
// Sources: Google OAuth 2.0 scopes, Microsoft Graph permissions, Okta API scopes.
var exactScopeTier = map[string]RiskTier{
	// ── Google: full-access mail/drive → broad data exfiltration → high ────────
	"https://mail.google.com/":                       RiskTierHigh, // full Gmail (read/send/delete)
	"https://www.googleapis.com/auth/gmail.modify":   RiskTierHigh, // read/write all mail
	"https://www.googleapis.com/auth/drive":          RiskTierHigh, // see/edit/delete ALL Drive files
	"https://www.googleapis.com/auth/spreadsheets":   RiskTierHigh, // all spreadsheets read/write
	"https://www.googleapis.com/auth/cloud-platform": RiskTierHigh, // full GCP API access

	// ── Google: read-only data surfaces → medium (access, not tamper) ──────────
	"https://www.googleapis.com/auth/gmail.readonly":    RiskTierMedium,
	"https://www.googleapis.com/auth/drive.readonly":    RiskTierMedium,
	"https://www.googleapis.com/auth/calendar.readonly": RiskTierMedium,
	"https://www.googleapis.com/auth/contacts.readonly": RiskTierMedium,
	"https://www.googleapis.com/auth/calendar":          RiskTierMedium, // calendar read/write (no mail/files)

	// ── Google: narrow file scope → medium (app-created files only) ────────────
	"https://www.googleapis.com/auth/drive.file": RiskTierMedium,

	// ── Google: identity-only → low ────────────────────────────────────────────
	"openid":  RiskTierLow,
	"email":   RiskTierLow,
	"profile": RiskTierLow,
	"https://www.googleapis.com/auth/userinfo.email":   RiskTierLow,
	"https://www.googleapis.com/auth/userinfo.profile": RiskTierLow,

	// ── Microsoft Graph: read-WRITE across a data surface → high ───────────────
	"Mail.ReadWrite":      RiskTierHigh,
	"Mail.Send":           RiskTierHigh, // can send as the user → phishing/BEC
	"Files.ReadWrite.All": RiskTierHigh,
	"Sites.ReadWrite.All": RiskTierHigh,
	"Mail.Read.All":       RiskTierHigh, // read EVERY mailbox in the tenant

	// ── Microsoft Graph: read-only single-surface → medium ─────────────────────
	"Mail.Read":      RiskTierMedium,
	"Files.Read.All": RiskTierMedium,
	"Calendars.Read": RiskTierMedium,
	"Contacts.Read":  RiskTierMedium,

	// ── Microsoft Graph: identity-only → low ───────────────────────────────────
	"User.Read":      RiskTierLow,
	"offline_access": RiskTierLow,

	// ── Microsoft Graph: tenant-admin reach → critical ─────────────────────────
	"Directory.ReadWrite.All":            RiskTierCritical, // create/modify users, groups, roles
	"RoleManagement.ReadWrite.Directory": RiskTierCritical, // assign directory roles
	"AppRoleAssignment.ReadWrite.All":    RiskTierCritical, // grant app permissions
	"Application.ReadWrite.All":          RiskTierCritical, // manage all app registrations
	"User.ReadWrite.All":                 RiskTierCritical, // modify any user

	// ── Okta: org/admin API scopes → critical ──────────────────────────────────
	"okta.users.manage":    RiskTierCritical,
	"okta.groups.manage":   RiskTierCritical,
	"okta.apps.manage":     RiskTierCritical,
	"okta.roles.manage":    RiskTierCritical,
	"okta.policies.manage": RiskTierCritical,
	// Okta read-only admin scopes → high (full directory READ is broad reach).
	"okta.users.read":  RiskTierHigh,
	"okta.groups.read": RiskTierHigh,
}

// prefixTier handles WILDCARD scope families a connector may emit that the exact
// table cannot enumerate. Checked (after the exact table) longest-prefix-first
// is unnecessary because the families below do not overlap. Conservative: every
// entry here is a positively-recognised broad family.
var prefixTier = []struct {
	prefix string
	tier   RiskTier
}{
	// Google Admin SDK Directory — tenant administration → critical. Covers
	// admin.directory.user, admin.directory.group, admin.directory.rolemanagement,
	// etc. (the admin.directory.* family the task calls out).
	{"https://www.googleapis.com/auth/admin.directory", RiskTierCritical},
	// Google Cloud Platform sub-scopes (…/auth/cloud-platform.*) → high.
	{"https://www.googleapis.com/auth/cloud-platform", RiskTierHigh},
}

// scopeTier returns the tier of ONE scope: exact table first (case-insensitive),
// then the wildcard prefix families, else low (an unrecognised scope is NOT
// promoted — we never invent risk we cannot justify).
func scopeTier(scope string) RiskTier {
	s := strings.TrimSpace(scope)
	if s == "" {
		return RiskTierLow
	}
	if t, ok := exactScopeTier[s]; ok {
		return t
	}
	// Case-insensitive fallback for the exact table (Graph scopes are sometimes
	// echoed lower-cased; Google scopes are case-stable but cheap to defend).
	lower := strings.ToLower(s)
	for k, t := range exactScopeTier {
		if strings.ToLower(k) == lower {
			return t
		}
	}
	for _, p := range prefixTier {
		if strings.HasPrefix(s, p.prefix) {
			return p.tier
		}
	}
	return RiskTierLow
}

// ScoreRiskyOAuth derives an OAuth grant's overall risk from its granted scopes.
// It returns the WORST tier across all scopes, the matching Severity (so the
// finding/Pulse path can rank it next to the other identity signals), and a
// short human reason. PURE — no I/O — so the store rebuild and any read path call
// the same logic and agree on a grant's tier.
//
//   - Empty scope set → low / SeverityNone (a grant with no scopes is no risk).
//   - critical/high tiers → SeverityHigh (a real, actionable broad-access grant).
//   - medium tier → SeverityMedium (read-only access worth reviewing).
//   - low tier → SeverityNone (identity-only / unknown: not surfaced as risk).
func ScoreRiskyOAuth(scopes []string) (Severity, string, RiskTier) {
	tier := RiskTierLow
	matched := false
	for _, sc := range scopes {
		if strings.TrimSpace(sc) == "" {
			continue
		}
		matched = true
		tier = worstTier(tier, scopeTier(sc))
	}
	if !matched {
		// No scopes at all → nothing to score.
		return SeverityNone, "", RiskTierLow
	}
	switch tier {
	case RiskTierCritical:
		return SeverityHigh, "OAuth app granted tenant-administrative scopes", RiskTierCritical
	case RiskTierHigh:
		return SeverityHigh, "OAuth app granted broad data-access scopes", RiskTierHigh
	case RiskTierMedium:
		return SeverityMedium, "OAuth app granted read-access scopes", RiskTierMedium
	default:
		return SeverityNone, "", RiskTierLow
	}
}

// CategoryRiskyOAuth — the local risk-category enum for a risky OAuth grant,
// reused verbatim as the Pulse PulseItem.Category and the finding rule key so the
// findings view and the war-room Pulse line up 1:1. Package-local; not DB-backed.
const CategoryRiskyOAuth Category = "identity_risky_oauth"
