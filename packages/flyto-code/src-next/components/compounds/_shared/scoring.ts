import { LETTER_GRADE_TONE } from '@lib/tokens/severity'

// --- Grade helpers ---
//
// Neutral, cross-surface display-scoring primitives. These were
// historically defined in `dashboard/types`, but they are consumed by
// many surfaces (organization, repos, arch, exposure, domains), so they
// live in the neutral `_shared` layer to avoid cross-surface god-file
// imports. `dashboard/types` keeps a re-export for dashboard-internal
// callers.
//
// Bitsight-style display scoring:
//   - Raw engine score: 0–100
//   - Display score: 300–900, floored to nearest 10
//   - Flooring avoids false precision — every visible change maps to a
//     real risk vector change.
// Security-semantic grade palette — every colour carries a fixed
// meaning (see feedback_ui_grounded_palette.md). B was previously cyan
// (#06b6d4) which broke the "資安代表色 紅綠黃橘" rule by introducing a
// non-semantic hue. Now B uses lime (a lighter green than A) so the
// good→bad gradient stays inside the four allowed hues:
//   A green → B lime → C yellow → D orange → F red.
// Derived from the canonical LETTER_GRADE_TONE (single source of truth).
export const GRADE_COLORS: Record<string, string> = {
  A: LETTER_GRADE_TONE.A.tone, B: LETTER_GRADE_TONE.B.tone, C: LETTER_GRADE_TONE.C.tone,
  D: LETTER_GRADE_TONE.D.tone, F: LETTER_GRADE_TONE.F.tone,
}

/**
 * @deprecated TODO(backend-truth, B1) — mirrors engine
 * scoring.displayScore() / scoring.GradeFor(). This is the exact
 * "D 50 vs A 89" double-truth source that triggered the
 * feedback-backend-score-canonical rule.
 *
 * BLOCKED on backend projection: per-repo `display` + `grade`
 * fields don't ship on `repoHealth` today
 * (handlers_health.go:282 explicitly comments "frontend applies
 * displayScore()"). Cleanup waits until the engine adds the
 * fields. Until then, keep this function in lock-step with
 * scoring.GradeFor() by hand. See
 * flyto-engine/docs/FRONTEND_LOGIC_AUDIT_2026_05_24.md#B1
 */
export function displayScore(raw: number): number {
  return Math.floor((250 + raw * 6.5) / 10) * 10
}

/**
 * @deprecated TODO(backend-truth, B1) — see displayScore() above.
 * Same backend-projection blocker; this helper survives until the
 * engine ships per-repo grade.
 */
export function gradeFor(raw: number): string {
  const s = displayScore(raw)
  if (s >= 740) return 'A'   // Advanced
  if (s >= 640) return 'B'   // Good
  if (s >= 500) return 'C'   // Intermediate
  if (s >= 380) return 'D'   // Basic
  return 'F'                 // Critical
}
