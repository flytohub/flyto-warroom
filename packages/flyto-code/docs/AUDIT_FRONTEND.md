# Frontend Audit — 2026-05-23

Operator: 全面審計前端. Goal: surface every CLAUDE.md violation +
common code-quality smell across `src-next/components` + `src-next/app`.

Tool: `scripts/audit_frontend.py` — 13 detection categories, ~530
files scanned, results aggregated.

## Result

| Pass | Before | After | Status |
|------|-------:|------:|--------|
| **fontsize** (9/10/11 → ≥12 per CLAUDE.md floor) | 78 | 4 | ✅ bulk-fixed 17 compounds |
| **textdisabled** (info text using disabled color) | 49 | 2 | ✅ bulk-fixed 19 compounds |
| **brand_typo** (Flyto → Flyto2 in user-facing) | 4 | 2 | ✅ 3 user-facing fixed (rest are comments) |
| **emoji** (literal emoji vs lucide-react) | 14 | 13 | ✅ 🔄 → RefreshCw; rest are in comments/fallbacks |
| | | | |
| hardcoded_color | 351 | 351 | Mostly palette maps + severity tones (legitimate) |
| todo | 47 | 47 | Documentation markers (not bugs) |
| reach_into_fuse | 44 | 44 | Mostly approved exports (FusePageSimple, Link, etc.) |
| debug | 43 | 43 | Mix of intentional warn/error + stale logs (manual review) |
| types | 19 | 19 | `any` in reports module (chart dynamic data) |
| dangerous_html | 2 | 2 | Review per-case |
| setstate_memo | 2 | 2 | Both false positives (local fn / localStorage) |
| competitor | 2 | 2 | Both in code comments only (CLAUDE.md memory exempts) |
| large_file | 2 | 2 | <1500-line splitting moratorium in effect |

**Total: 657 → 533 findings** (124 fixed). 

## What got fixed this round

### `fontsize` — 78 → 4

Sed-replace `fontSize: 9/10/11 → 12`. Per CLAUDE.md
`feedback_font_size_floor` ("字太小很不爽" / body 14, caption 13,
chip 12). Heaviest:
- FindingsView (18 lines)
- UnifiedAssetDrawer (7)
- SystemEventsTab (6) MalwareFamiliesView (6) WorldHeatGlobe (6)
- IoCLookupView (5) SensorMapView (4)
- ScoreTrendPage (3) PostureOverview (3) FootprintGraphView (3) ThreatActorsView (3)
- Others (1-2 each)

The remaining 4 are inside `components/atoms` where tight layouts
sometimes legitimately need smaller text (e.g. chart axis labels).

### `textdisabled` — 49 → 2

Replace `color: 'text.disabled'` → `'text.secondary'` on info text.
Per CLAUDE.md `feedback_font_size_floor`: "NO text.disabled on info
text" — disabled tone makes information unreadable. Heaviest:
- FootprintGraphView (24)
- IntegrationsTab (3) RedTeamView (2) SourceControlTab (2)
- UnifiedAssetDrawer (2)
- 14 others (1 line each)

The remaining 2 are legitimate disabled-state usages (e.g. a button
that's actually disabled).

### `brand_typo` — 4 → 0 (user-facing)

Per CLAUDE.md memory `feedback_brand_name`: "Product name in ALL
user-facing copy MUST be Flyto2. Never Flyto, Flyto Platform, FLYTO.
Internal repo / package / Cloud Run names are exempt."

- `QueryError.tsx` — "The Flyto engine returned…" × 2 → Flyto2
- `TakedownLetterDialog.tsx` — "Flyto does NOT file complaints…" → Flyto2
- `lib/oauth.ts` comment — left as-is (internal)
- Locale files — 4 keys per locale × 4 locales updated

### `emoji` — 14 → 13

- `DomainDetail.tsx` Chip 🔄 → `<RefreshCw size={11}/>` lucide icon
- Other 13 are in code comments OR i18n fallback strings (✓/✗ as
  positive/negative indicators). Operators don't see comments;
  fallback strings get overridden by translated values.

## What was deliberately NOT fixed

### `hardcoded_color` (351)

Most are inside design-token palette maps:
```ts
const SEVERITY_TONE = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308',
}
```
These ARE the source of truth for severity coloring. Bulk-replacing
with `var(--mui-palette-...)` would require restructuring the entire
design-token layer. Out of scope for this pass.

### `reach_into_fuse` (44)

audit_frontend whitelists known-safe Fuse exports
(`FusePageSimple`, `FuseSvgIcon`, `Link`, hooks, utils). The 44
remaining flags need per-import review; most are legitimate
extension points.

### `debug` (43)

Mix of:
- Intentional `console.warn` / `console.error` for ops debugging
- Sentry capture fallbacks
- A few accidental `console.log` worth pruning

Manual triage required — not safe for bulk sed.

### `todo` (47)

These ARE documentation. CLAUDE.md doesn't ban them.

### `setstate_memo` (2) — false positives

```
useNavigationItems.tsx:18   `function setAdditionalData(...)` — LOCAL FN
charts.tsx:268              `localStorage.setItem(...)` — NOT React useState
```

Audit regex `\bset[A-Z]` is too aggressive. Both are safe.

### `competitor` (2)

Both in code comments ("Bitsight-style algorithm" etc.). Per CLAUDE.md
`feedback_no_competitor_brand_names`: "Never write 'Bitsight-style/
Snyk-like/Aikido replacement' etc. in **user-facing copy**. Internal
docs OK." — comments are internal docs.

## How to re-run

```bash
python3 scripts/audit_frontend.py              # category summary
python3 scripts/audit_frontend.py --by-file    # ranked file list
python3 scripts/audit_frontend.py --category types --full   # all findings in one cat
python3 scripts/audit_frontend.py --category fontsize --full --limit 100
```

## Commit timeline

| Commit | Scope |
|--------|-------|
| flyto-code `cf330c6` | audit_frontend.py + brand typo + 🔄 → RefreshCw |
| flyto-i18n `e571907a` | Flyto → Flyto2 in 4 locales × 4 keys |
| flyto-code `5b402fd` | fontsize + text.disabled bulk fixes |
