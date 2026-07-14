// Package leakscore — PURE, read-derived dark-web credential-leak scoring.
//
// Slice 1 of "P1 Dark Web / Threat Intel depth" (vendor fusion, NOT a crawler).
// Greenfield, I/O-free, mirroring internal/identityscore: it takes the leak facts
// the kernel ALREADY carries per identity/email principal (the darkweb.* claims
// ingested via the certified cyble.v1 mapping and anchored on the canonical
// email — the SAME resource identity_principals and okta.v1 use) and answers one
// question per leaked principal —
//
//	"how urgent is this credential leak, given how fresh it is and whether the
//	 plaintext password was recovered?"
//
// It owns NO storage, NO query, NO mutation. The Pulse leak collector and any
// future leak surface call this single source of truth so they agree on what a
// leak is worth.
//
// Severity + Category are LOCAL enums (package-local string consts like
// identityscore.Severity / attribution.Pool, NOT a DB-backed Valid* closed set):
// nothing here is persisted, so there is no Gate-C closed-set contract to honour.
//
// Slice 1 scores freshness + plaintext only (ScoreLeak). Slice 2 adds the
// privileged / external-principal BLAST-RADIUS dimension (ScoreLeakedPrincipal):
// the caller passes the is_privileged / is_external / mfa facts the
// identity_principals projection already carries, and a leaked privileged (or
// external) credential escalates to CRITICAL. This package still owns NO storage
// and reads nothing — the blast-radius facts are passed IN as plain bools, so it
// stays store-decoupled.
//
// Slice 3 splits out an EXPLICIT freshness-decay confidence (FreshnessOf): a
// separate "how live is this leak still?" signal from the same 30/365 windows,
// orthogonal to Severity, so the UI can say "leak seen 400d ago — low confidence
// it's still live" while an old leaked-admin credential still ranks CRITICAL by
// blast radius. Still pure (no I/O).
package leakscore

import "time"

// Severity is the local, read-time risk level for a leak signal. It maps onto the
// same critical/high/medium/low strings the Pulse PulseItem.Severity and the
// other scorers use, so a downstream consumer (pulseBlast) can rank it without a
// translation table. NOT a store-backed closed set.
type Severity string

const (
	// SeverityCritical — a leaked credential whose principal is a high blast-radius
	// account: a PRIVILEGED user (admin/owner) or an EXTERNAL collaborator/guest.
	// A leaked admin password, or a leaked credential for an outside party who
	// nonetheless holds access, is the war-room "drop everything" tier — the
	// privileged/external blast radius outweighs freshness. Slice-2 only.
	SeverityCritical Severity = "critical"
	// SeverityHigh — a fresh leak (seen within the freshness window). A recently
	// surfaced credential is the most actionable: it may still be live and is the
	// likeliest to be used in an attack right now.
	SeverityHigh Severity = "high"
	// SeverityMedium — a leak older than the freshness window but within a year:
	// real exposure worth flagging, lower urgency than a fresh sighting (the
	// credential may already be rotated, but absence of rotation is unproven).
	SeverityMedium Severity = "medium"
	// SeverityLow — an old leak (>1y). Historical exposure; surface it for the
	// record, but it should not crowd a war-room top-line.
	SeverityLow Severity = "low"
	// SeverityNone — no leak risk derived from this signal.
	SeverityNone Severity = ""
)

// Category is the local risk-category enum, reused verbatim as the Pulse
// PulseItem.Category so the UI can group leak rows. Package-local; not DB-backed.
type Category string

const (
	// CategoryCredentialLeak — an email-anchored credential found on the dark web.
	CategoryCredentialLeak Category = "darkweb_credential_leak"
	// CategoryDomainLeak — a DOMAIN-anchored dark-web credential-leak sighting
	// (the cyble.v1 "$.leaks[*]" record, canonical category=infrastructure /
	// type=domain). It is NOT a person: there is no is_privileged / is_external /
	// MFA blast radius to weigh, so it is scored by FRESHNESS ONLY and surfaced on
	// its own Pulse path rather than degrading into the email scorer (which would
	// emit a zero-blast-radius orphan row). Local enum; not DB-backed — no Gate-C
	// closed-set contract to honour (see the package doc).
	CategoryDomainLeak Category = "darkweb_domain_leak"
)

// Freshness is the slice-3 explicit "how live is this leak still?" signal, split
// out from Severity so the UI can say "leak seen 400d ago — low confidence it's
// still live" WITHOUT re-deriving the windows. Severity answers "how bad is this
// if true / how big is the blast radius"; Freshness answers the orthogonal "how
// confident are we the credential is still usable, given the sighting's age".
// A fresh privileged leak is still CRITICAL severity but its Confidence is high;
// an old privileged leak is still CRITICAL (blast radius doesn't decay) but its
// Confidence is low — the war-room can rank a fresh-critical above a stale-critical.
// Local enum; not DB-backed.
type Freshness string

const (
	// FreshnessFresh — sighting within the fresh window (≤30d). High confidence the
	// credential is still live and actionable right now.
	FreshnessFresh Freshness = "fresh"
	// FreshnessRecent — older than fresh but within a year (30–365d). Real exposure,
	// moderate confidence it's still live (rotation plausible but unproven).
	FreshnessRecent Freshness = "recent"
	// FreshnessStale — older than a year (>365d). Historical; low confidence the
	// credential is still live, but NOT "clean" — old exposure is still exposure.
	FreshnessStale Freshness = "stale"
	// FreshnessUnknown — a leak with no last-seen timestamp. We can't prove recency,
	// so confidence is the undated-leak floor; explicitly NOT treated as fresh.
	FreshnessUnknown Freshness = "unknown"
)

// Freshness confidence anchors (0..100), one per bucket. PRODUCT DEFAULT (flagged):
// these are the confidence a credential is still live, decaying with sighting age.
// They are tunable knobs, not invariants — the only contract is the monotonic
// ordering fresh > recent ≥ unknown > stale, asserted by the freshness test.
const (
	ConfidenceFresh   = 90 // ≤30d
	ConfidenceRecent  = 60 // 30–365d
	ConfidenceUnknown = 50 // undated leak: present but unrecency-provable
	ConfidenceStale   = 25 // >365d
)

// FreshnessOf classifies a leak's last-seen age into the explicit slice-3
// freshness bucket AND a decayed confidence (0..100) that the credential is still
// live. PURE (no I/O): the caller passes lastSeen + now, exactly like ScoreLeak.
// lastSeen nil = undated leak → FreshnessUnknown at the undated floor (present,
// but recency unprovable) — never silently dropped, never treated as fresh.
//
// Reuses the SAME 30/365 windows as ScoreLeak's freshnessSeverity so severity and
// freshness can never disagree about what "fresh" means.
func FreshnessOf(lastSeen *time.Time, now time.Time) (Freshness, int) {
	if lastSeen == nil {
		return FreshnessUnknown, ConfidenceUnknown
	}
	d := daysBetween(now, *lastSeen)
	switch {
	case d <= FreshLeakDays:
		return FreshnessFresh, ConfidenceFresh
	case d <= OldLeakDays:
		return FreshnessRecent, ConfidenceRecent
	default:
		return FreshnessStale, ConfidenceStale
	}
}

// Freshness windows, in days. PRODUCT DEFAULT (flagged): a leak seen ≤30d ago is
// HIGH, 30–365d is MEDIUM, >365d is LOW. The 30-day fresh window mirrors the
// attack_paths WhyNowWindowLeak=30 precedent (internal/correlate/attack_paths/
// helpers.go) so "why now" and leakscore agree on what "fresh leak" means; the
// 365-day stale window mirrors WhyNowWindowFreshness=365. Both are tunable
// product knobs, not invariants.
const (
	FreshLeakDays = 30
	OldLeakDays   = 365
)

// ScoreLeak rates one leaked principal's exposure from the two slice-1 signals:
// freshness of the last sighting and whether the plaintext password was
// recovered. lastSeen nil = we have a leak claim but no last-seen timestamp; that
// is NOT treated as fresh (we can't prove recency) but it is also NOT dropped —
// an undated leak is still a present exposure, scored at MEDIUM (the same "absent
// timestamp ≠ clean, but ≠ worst" stance the native bridge takes for an empty
// grade). A plaintext-available leak is bumped one level (capped at HIGH), since a
// recovered password is materially worse than a hash-only sighting.
//
// Returns (SeverityNone, "") never in slice 1 — a leak claim that reaches this
// scorer is always at least LOW exposure (the caller decides whether a principal
// has a leak at all; this function only rates one that does).
func ScoreLeak(lastSeen *time.Time, now time.Time, plaintextAvailable bool) (Severity, string) {
	base, reason := freshnessSeverity(lastSeen, now)
	if plaintextAvailable {
		base = bump(base)
		reason = reason + ", plaintext password recovered"
	}
	return base, reason
}

// ScoreLeakedPrincipal rates a leaked credential AGAINST the principal's blast
// radius — the slice-2 join. It starts from the slice-1 freshness+plaintext score
// (ScoreLeak) and escalates by who the credential belongs to, using the
// is_privileged / is_external / mfaEnrolled facts the identity_principals
// projection already carries (passed in as plain bools — this package reads no
// store). mfaEnrolled is the tri-state *bool the projection holds: nil = unknown
// (no MFA claim) and is treated as "MFA not proven" for the no-MFA escalation.
//
// Escalation ladder (PRODUCT DEFAULT, flagged):
//   - PRIVILEGED + (EXTERNAL or no-MFA) → CRITICAL. A leaked admin password that
//     is ALSO an outside collaborator, or an admin with no second factor to blunt
//     the leak, is the "drop everything" tier — the leaked credential is very
//     likely directly usable for privileged access.
//   - PRIVILEGED (alone) → at least HIGH. A leaked admin credential is serious
//     even if MFA may still gate it (MFA fatigue / SIM-swap erode that).
//   - EXTERNAL (alone) → at least HIGH. A leaked external-collaborator credential
//     is an out-of-your-control account with access — bumped above a plain leak.
//   - otherwise → the slice-1 freshness/plaintext base (ordinary user).
//
// The blast-radius escalation never DOWNGRADES the base (a fresh plaintext leak
// already High stays at least High); it only raises the floor.
func ScoreLeakedPrincipal(lastSeen *time.Time, now time.Time, plaintextAvailable, isPrivileged, isExternal bool, mfaEnrolled *bool) (Severity, string) {
	base, reason := ScoreLeak(lastSeen, now, plaintextAvailable)

	noMFA := mfaEnrolled == nil || !*mfaEnrolled
	switch {
	case isPrivileged && (isExternal || noMFA):
		why := "privileged account"
		switch {
		case isExternal && noMFA:
			why = "privileged external account without MFA"
		case isExternal:
			why = "privileged external account"
		default: // noMFA
			why = "privileged account without MFA"
		}
		return SeverityCritical, "leaked credential for a " + why + " — " + reason
	case isPrivileged:
		return atLeast(base, SeverityHigh), "leaked credential for a privileged account — " + reason
	case isExternal:
		return atLeast(base, SeverityHigh), "leaked credential for an external collaborator — " + reason
	default:
		return base, reason
	}
}

// ScoreDomainLeak rates a DOMAIN-anchored dark-web credential-leak sighting from
// FRESHNESS ALONE. Unlike ScoreLeakedPrincipal, a domain leak carries NO person
// facts (is_privileged / is_external / MFA are properties of an account, not a
// domain), so there is NO blast-radius escalation and NO plaintext bump — those
// are per-credential signals the domain record does not carry. A domain sighting
// is simply: "credentials for this domain were seen on the dark web N days ago",
// scored high/medium/low strictly by the SAME 30/365 freshness windows the
// email path uses (freshnessSeverity), so the two paths agree on what "fresh"
// means. A zero lastSeen = undated sighting → the freshnessSeverity undated floor
// (MEDIUM), never silently dropped and never treated as fresh.
//
// PURE (no I/O): the caller passes lastSeen + now, exactly like ScoreLeak. The
// deeper Bitsight posture FUSION the cyble.v1 mapping header anticipates (fusing a
// domain leak with the domain's external posture grade) is a deferred follow-up —
// it needs vendor posture data this scorer does not take; today the domain leak is
// surfaced correctly on its own freshness merit.
func ScoreDomainLeak(lastSeen, now time.Time) (Severity, string) {
	var ls *time.Time
	if !lastSeen.IsZero() {
		t := lastSeen
		ls = &t
	}
	sev, reason := freshnessSeverity(ls, now)
	return sev, "domain " + reason
}

// severityRank orders the local severities so atLeast can take the worse of two.
func severityRank(s Severity) int {
	switch s {
	case SeverityCritical:
		return 4
	case SeverityHigh:
		return 3
	case SeverityMedium:
		return 2
	case SeverityLow:
		return 1
	default:
		return 0
	}
}

// atLeast returns whichever of base/floor is the more severe (never downgrades
// below the freshness/plaintext base, only raises the floor for blast radius).
func atLeast(base, floor Severity) Severity {
	if severityRank(base) >= severityRank(floor) {
		return base
	}
	return floor
}

// freshnessSeverity buckets the last-seen age into the freshness windows.
func freshnessSeverity(lastSeen *time.Time, now time.Time) (Severity, string) {
	if lastSeen == nil {
		return SeverityMedium, "credential leak (last-seen unknown)"
	}
	d := daysBetween(now, *lastSeen)
	switch {
	case d <= FreshLeakDays:
		return SeverityHigh, "credential leak seen " + itoa(maxInt(d, 0)) + "d ago (fresh ≤" + itoa(FreshLeakDays) + "d)"
	case d <= OldLeakDays:
		return SeverityMedium, "credential leak seen " + itoa(d) + "d ago"
	default:
		return SeverityLow, "credential leak seen " + itoa(d) + "d ago (old >" + itoa(OldLeakDays) + "d)"
	}
}

// bump raises a severity one level, capped at HIGH (slice 1 has no critical: a
// single leaked credential, even with plaintext, is High — the org-wide "drop
// everything" critical is a slice-2 privileged/external concern).
func bump(s Severity) Severity {
	switch s {
	case SeverityLow:
		return SeverityMedium
	case SeverityMedium, SeverityHigh:
		return SeverityHigh
	default:
		return s
	}
}

// daysBetween returns whole days elapsed from then→now (negative if then is in
// the future). Mirrors identityscore.daysBetween.
func daysBetween(now, then time.Time) int {
	return int(now.Sub(then).Hours() / 24)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// itoa is a tiny local int→string (avoids pulling strconv into reasons only),
// mirroring identityscore.itoa.
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
