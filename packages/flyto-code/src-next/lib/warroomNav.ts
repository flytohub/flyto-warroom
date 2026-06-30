// warroomNav.ts — cross-page deep-link helpers for the war-room.
//
// The legacy `flyto:navigate-section` CustomEvent only carries
// the section id. For the Exposure hub redesign we need to also
// pass *what filter to apply* on arrival (e.g. KPI click on
// Posture Overview → CTEM Actions with breached-only filter set).
//
// Approach: stash the filter intent in sessionStorage under a
// well-known key, then dispatch the section-switch event. The
// destination view reads + clears the key on mount. sessionStorage
// (not localStorage) so a fresh tab doesn't inherit yesterday's
// filter intent.

const STASH_KEY = 'flyto:ctem-actions-filter-intent'

/** Filter intent the operator clicked from somewhere else. CTEM
 *  Actions reads this on mount and pre-applies. All fields
 *  optional — caller passes only what's relevant to the click. */
export interface CTEMActionsIntent {
  search?: string
  tiers?: Array<'crown_jewel' | 'customer_facing' | 'internal' | 'sandbox'>
  severities?: Array<'critical' | 'high' | 'medium' | 'low'>
  breachedOnly?: boolean
  verifyingOnly?: boolean
  hasThreatActor?: boolean
  unassignedOnly?: boolean
  /** Pre-select a finding by fingerprint, opens its detail panel. */
  selectFingerprint?: string
}

export function navigateToCTEMActions(intent?: CTEMActionsIntent) {
  if (intent && Object.keys(intent).length > 0) {
    try {
      sessionStorage.setItem(STASH_KEY, JSON.stringify(intent))
    } catch {
      // sessionStorage may be unavailable (Safari private mode);
      // navigation still works without the filter preset.
    }
  }
  window.dispatchEvent(
    new CustomEvent('flyto:navigate-section', { detail: { sectionId: 'exp-ctem' } }),
  )
}

/** Read + clear the stashed intent. CTEM Actions calls this once
 *  on mount; null when no intent is pending.
 *
 *  Audit 2026-05-17: previously removed the key BEFORE parsing,
 *  so a malformed payload silently consumed the intent and the
 *  caller saw null — the operator's click was lost. The order now
 *  is parse → succeed → remove. A parse failure leaves the stash
 *  intact so the next consume call retries (and a manual reload
 *  surfaces the operator's intent rather than swallowing it). */
export function consumeCTEMActionsIntent(): CTEMActionsIntent | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(STASH_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: CTEMActionsIntent
  try {
    parsed = JSON.parse(raw) as CTEMActionsIntent
  } catch {
    // Malformed payload — clear it so we don't loop forever.
    try { sessionStorage.removeItem(STASH_KEY) } catch { /* ignore */ }
    return null
  }
  try { sessionStorage.removeItem(STASH_KEY) } catch { /* ignore */ }
  return parsed
}

/** Generic helper for sections that don't need a filter payload. */
export function navigateToSection(sectionId: string) {
  window.dispatchEvent(
    new CustomEvent('flyto:navigate-section', { detail: { sectionId } }),
  )
}
