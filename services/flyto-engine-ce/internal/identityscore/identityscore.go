// Package identityscore — PURE, read-derived identity risk scoring.
//
// Slice 1 of "P1 Identity Security depth". This is a greenfield, I/O-free
// package mirroring internal/scoring + internal/attribution conventions: it
// takes the identity facts the kernel ALREADY carries per principal
// (identity.mfa_enrolled + identity.status claims, ingested via the certified
// okta.v1 mapping and anchored on the canonical email) and answers one question
// per signal —
//
//	"is this principal at risk because it has no second factor, or because its
//	 lifecycle status is not active (suspended / deprovisioned-but-present)?"
//
// It owns NO storage, NO query, NO mutation. The MFA/status risk logic used to
// live inline in api/handlers_identity.go (handleIdentityPosture's
// `noMFA || status != active` counting) and in the Pulse collector; this package
// is the single source of truth both now call so the posture endpoint and the
// war-room Pulse agree on what "at risk" means.
//
// Severity + category are LOCAL enums (not a DB-backed Valid* closed set, Gate
// C): nothing here is persisted, so the values are package-local string consts
// like attribution.Pool, not store columns.
package identityscore

import (
	"strings"
	"time"
)

// Severity is the local, read-time risk level for an identity signal. It maps
// onto the same critical/high/medium/low strings the Pulse PulseItem.Severity
// and the scorer use, so a downstream consumer (pulseBlast) can rank it without
// a translation table. NOT a store-backed closed set.
type Severity string

const (
	// SeverityHigh — a real, actionable identity gap (no MFA, or a non-active
	// account that still has live claims). High (not critical): a single
	// principal's posture gap is serious but not, on its own, the org-wide
	// "drop everything" critical a confirmed breach would be.
	SeverityHigh Severity = "high"
	// SeverityMedium — a posture weakness worth flagging but lower-urgency than a
	// missing control: a stale human login, an external collaborator, or an
	// inactive service account. Real attack surface, not an active gap.
	SeverityMedium Severity = "medium"
	// SeverityNone — no risk derived from this signal.
	SeverityNone Severity = ""
)

// Category is the local risk-category enum, reused verbatim as the Pulse
// PulseItem.Category so the UI can group identity rows by failing control.
// Package-local; not DB-backed.
type Category string

const (
	// CategoryMFA — the principal is missing (or has unknown) MFA enrolment.
	CategoryMFA Category = "identity_mfa"
	// CategoryStatus — the principal's lifecycle status is not "active".
	CategoryStatus Category = "identity_status"
	// CategoryStale — a human principal whose last login is older than the org's
	// stale threshold (default 90d): a dormant account is unmonitored attack surface.
	CategoryStale Category = "identity_stale"
	// CategoryPrivilegedNoMFA — a privileged (admin) principal with no proven
	// MFA: the highest-blast-radius identity gap (admin + no second factor).
	CategoryPrivilegedNoMFA Category = "identity_privileged_no_mfa"
	// CategoryExternalPrivileged — an external collaborator (email domain ∉ org
	// seed) that also holds privilege: an outside party with admin reach.
	CategoryExternalPrivileged Category = "identity_external_privileged"
	// CategoryInactiveServiceAccount — a service account whose last activity is
	// older than the org's service-inactive threshold (default 30d): an unused
	// machine credential is a stale key that should be rotated/revoked.
	CategoryInactiveServiceAccount Category = "identity_inactive_service_account"
)

// StatusActive is the one lifecycle status that is NOT a risk. okta.v1 lowercases
// the vendor status (ACTIVE/SUSPENDED/DEPROVISIONED → active/suspended/…), so the
// comparison is lowercase. Mirrors the inline `status != "active"` rule the
// posture endpoint used before this package existed.
const StatusActive = "active"

// IdentitySignal is the already-available, per-principal fact set the kernel
// carries. Every field is read straight from the identity.* claims (or the
// posture endpoint's per-resource aggregate) — nothing here requires a new query.
// A zero value is valid: it represents a principal we have no identity claims
// for, which scores as no risk (Configured=false territory).
type IdentitySignal struct {
	// ResourceID — kernel_resources.id for the email/identity principal.
	ResourceID string
	// Principal — the canonical email / login the claims are anchored on
	// (cosmetic; carried for the reason string + UI, never required).
	Principal string
	// MFAEnrolled — tri-state. nil = no mfa claim seen (unknown → risk, we
	// can't prove a second factor); &false = enrolled=false (risk); &true = ok.
	MFAEnrolled *bool
	// Status — the lifecycle status claim, already lowercased ("" when no
	// status claim was ingested for this principal).
	Status string
}

// ScoreNoMFA scores the MFA-enrolment signal. No second factor — or an UNKNOWN
// enrolment state (nil, i.e. we have identity claims for this principal but none
// asserting MFA) — is a risk: absence of proof of a second factor is treated as
// missing, never as "fine". Returns (SeverityNone, "") only when MFA is proven
// enrolled.
func ScoreNoMFA(mfaEnrolled *bool) (Severity, string) {
	if mfaEnrolled == nil {
		return SeverityHigh, "MFA enrolment unknown"
	}
	if !*mfaEnrolled {
		return SeverityHigh, "no MFA"
	}
	return SeverityNone, ""
}

// ScoreBadStatus scores the lifecycle-status signal. Any status that is present
// and not "active" (suspended, deprovisioned-but-still-claimed, …) is a risk: a
// non-active account that still has live identity claims is an attack-surface
// gap (orphaned access). An empty status ("" = no status claim) is NOT scored —
// absence of a status claim is handled by the MFA signal / Configured gate, not
// invented here. The status comparison is case-insensitive defensively, though
// okta.v1 already lowercases.
func ScoreBadStatus(status string) (Severity, string) {
	if status == "" || strings.EqualFold(status, StatusActive) {
		return SeverityNone, ""
	}
	return SeverityHigh, "status=" + status
}

// IsAtRisk reports whether either signal flags the principal — the single
// definition of "at risk" the posture endpoint's AtRisk list and the Pulse
// collector share. Behaviour-preserving vs the old inline
// `(mfaSeen && !mfa) || (status != "" && status != "active")`, but with the
// added unknown-MFA-is-risk rule made explicit via ScoreNoMFA's nil handling;
// callers that only count claims they actually saw pass a non-nil MFAEnrolled.
func (s IdentitySignal) IsAtRisk() bool {
	mfaSev, _ := ScoreNoMFA(s.MFAEnrolled)
	statusSev, _ := ScoreBadStatus(s.Status)
	return mfaSev != SeverityNone || statusSev != SeverityNone
}

// KindServiceAccount mirrors store.IdentityKindServiceAccount as a package-local
// const so this scorer stays I/O- and store-decoupled (it never imports store).
// The string must stay in lockstep with the store kind enum.
const KindServiceAccount = "service_account"

// daysBetween returns whole days elapsed from then→now (negative if then is in
// the future). Used by the threshold comparisons.
func daysBetween(now, then time.Time) int {
	return int(now.Sub(then).Hours() / 24)
}

// ScoreStale scores a HUMAN principal's login recency. A nil lastLogin (no
// last-login fact ingested) is NOT scored — absence of the signal is not risk
// (most orgs have no login-event connector yet). A thresholdDays ≤ 0 is treated
// as "scoring disabled" (no row / misconfig) and returns no risk rather than
// flagging everything. The boundary is INCLUSIVE: exactly thresholdDays since the
// last login flags as stale. Medium severity (a dormant account is surface, not
// an active control gap).
func ScoreStale(lastLogin *time.Time, now time.Time, thresholdDays int) (Severity, string) {
	if lastLogin == nil || thresholdDays <= 0 {
		return SeverityNone, ""
	}
	d := daysBetween(now, *lastLogin)
	if d < thresholdDays {
		return SeverityNone, ""
	}
	return SeverityMedium, "no login in " + itoa(d) + "d (stale ≥" + itoa(thresholdDays) + "d)"
}

// ScorePrivilegedNoMFA scores the high-blast-radius admin + no-MFA combo. Only a
// PRIVILEGED principal is scored; a non-privileged no-MFA gap is the ordinary
// ScoreNoMFA signal, not this one. MFA is the same tri-state as ScoreNoMFA: nil
// (unknown) or &false both count as "no proven second factor" on an admin → High.
// A privileged principal with proven MFA is NOT flagged here.
func ScorePrivilegedNoMFA(isPrivileged bool, mfaEnrolled *bool) (Severity, string) {
	if !isPrivileged {
		return SeverityNone, ""
	}
	if mfaEnrolled != nil && *mfaEnrolled {
		return SeverityNone, ""
	}
	if mfaEnrolled == nil {
		return SeverityHigh, "privileged account, MFA enrolment unknown"
	}
	return SeverityHigh, "privileged account with no MFA"
}

// ScoreInactiveServiceAccount scores a SERVICE account that has gone quiet. Only
// fires for kind == service_account (a human's dormancy is ScoreStale's job, on a
// looser threshold). nil lastLogin / thresholdDays ≤ 0 → not scored (same absence
// rule as ScoreStale). Boundary INCLUSIVE. Medium severity (a stale machine
// credential should be rotated, but it is not an active breach).
func ScoreInactiveServiceAccount(kind string, lastLogin *time.Time, now time.Time, thresholdDays int) (Severity, string) {
	if kind != KindServiceAccount {
		return SeverityNone, ""
	}
	if lastLogin == nil || thresholdDays <= 0 {
		return SeverityNone, ""
	}
	d := daysBetween(now, *lastLogin)
	if d < thresholdDays {
		return SeverityNone, ""
	}
	return SeverityMedium, "service account inactive " + itoa(d) + "d (≥" + itoa(thresholdDays) + "d)"
}

// ScoreExternalPrivileged scores an external collaborator that ALSO holds
// privilege — an outside party (email domain ∉ org seed) with admin reach. Both
// conditions are required; an external non-admin or an internal admin is not this
// signal. Medium severity: an external admin is a real concentration of risk, but
// it can be legitimate (an MSP / contractor), so it is flagged for review rather
// than treated as a confirmed High gap.
func ScoreExternalPrivileged(isExternal, isPrivileged bool) (Severity, string) {
	if isExternal && isPrivileged {
		return SeverityMedium, "external collaborator holds privileged access"
	}
	return SeverityNone, ""
}

// itoa is a tiny local int→string (avoids pulling strconv into reasons only).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
