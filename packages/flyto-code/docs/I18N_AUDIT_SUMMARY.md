# i18n Audit Summary — 2026-05-23

Operator request: "全面翻譯 全面檢查". This documents the audit pass
that ran across all `src-next/components` compounds + the remaining
files that were intentionally NOT changed.

## Audit tool

`scripts/audit_hardcoded_english.py` — walks every `*.tsx` under
`src-next/components`, matches plausible user-facing English in JSX
children, label/placeholder/title attributes, and object-literal
`label:` fields. Filters out tOr-wrapped calls, comments, technical
identifiers, and template/template-adjacent dirs (`@fuse`, `@auth`,
`@i18n`, `@mock-utils`).

```bash
python3 scripts/audit_hardcoded_english.py            # namespace summary
python3 scripts/audit_hardcoded_english.py --top 30   # top files
python3 scripts/audit_hardcoded_english.py path/file.tsx  # per-file detail
```

## Initial baseline

267 candidate strings across 58 files.

## Sweep — what got wrapped + translated

7 batches across 19 compound files. ~187 new i18n keys added to
en / zh-TW / zh-CN / ja simultaneously. All commits paired
(code change + i18n keys land together).

| Batch | Compound | Keys |
|-------|----------|-----|
| FootprintGraphView baseline | tier filter, connector progress, scenario buckets, hop labels, legend, promotion badges | 30 |
| FindingsView | column labels via `columnLabel()` helper, severity / grade / source dropdowns | 17 |
| RuleTuningModal | 21 claim-rule labels via `tOr('footprint.claim.${kind}')` | 21 |
| UnifiedAssetDrawer | 13 stat labels (Entities / Subdomains / Lookalikes / etc.) | 15 |
| CTEMExtrasPanel | War-room actions, Alert history, Blast-radius graph, AI-proposed fix, Compliance evidence binder | 6 |
| MitigationsView | Control types (WAF / EDR / Patch / etc.), evidence-tier labels + hints | 12 |
| AttackPathsView | Path-type metadata (crown_jewel / edge_to_internal / cred_to_privesc), edge-kind labels | 11 |
| ActionItemCard | Priority (urgent/important/suggested), difficulty (quick-win/medium/project) | 6 |
| BrandProtectionView | Takedown state labels (detected → resolved/rejected) | 6 |
| AutofixPreviewModal | 5 preview-step labels (clone → detect → transform → verify → persist) | 5 |
| VendorFormDialog | Category options (CDN/Hosting/Analytics/Payment/SaaS/Other) | 6 |
| BudgetPoliciesTab | Hard Stop / Active / Inactive / Total/Input/Output Tokens / Window options | 11 |
| AssetMapView | Aria label | 1 |
| ComplianceDashboardView | "Overall" | 1 |
| PostureOverview | Clear selection + 6 sector-band labels | 7 |
| IssuesSidebar | 4 category names (All Findings / Vulnerabilities / Exposed Secrets / Code Issues) | 4 |
| HistoryTimeline | 6 event types (created / status_changed / resolved / reopened / assigned / snoozed) | 7 |
| SecurityOverview | 4 severity labels (Critical / High / Medium / Low — alias to common.*) | 0 |
| ScoringMethodology | 4 dimension labels (Security / Complexity / Docs / Dead Code) | 4 |
| VendorRiskView | 5 risk-tone labels (alias to common.* for severity) | 5 |
| ScanningTab | 4 cadence options (Daily / Weekly recommended / Manual / Daily+DAST) | 4 |
| ScanLogTab | 4 scan status labels (Complete / Failed / Running / Queued) | 4 |

## Deliberately NOT translated

These appear in the audit output but are intentional English.

### Compliance framework names (proper nouns)

`SOC 2`, `ISO 27001`, `PCI DSS`, `OWASP Top 10`, `GDPR`, `HIPAA`,
`NIST CSF`. Industry-standard certifications + frameworks; their
official names ARE English globally. Translating "ISO 27001" to
中文 confuses operators expecting the universal name.

### Technical abbreviation badges

`CRIT` / `HIGH` / `MOD` / `LOW` (severity badges), `KEY` / `SEC`
/ `GO` / `JS` / `RS` / `PY` (file-type chips in `IssueHelpers.tsx`).
Designed as 3-4 char universal codes; expanding them per locale
breaks the chip width budget.

### Operator vocabulary

`SSL` / `TLS` / `WAF` / `HSTS Preload` / `AXFR Vuln` / `GraphQL`
/ `PageSpeed` in `DomainSummary.tsx`. These are technical terms
all security operators use in English regardless of locale.
`PageSpeed` is also a Google product name.

### Template / vendored code

`src-next/components/tiptap/` — Tiptap rich-text editor template.
i18n is owned by the upstream Tiptap UI package; modifying our
copy diverges from the template.

### Footer / branding

`PoweredByLinks.tsx` — vendor attribution links; convention is to
preserve original casing/spelling.

## Anti-patterns the sweep avoided

- **Don't translate at module top-level.** `const FOO = [{ label:
  tOr(...) }]` runs before i18n init returns 'en' fallback. Move
  to render-time function (`function getFoos()` or wrap labels
  at the consumer site). CLAUDE.md i18n rule 5.
- **Don't burn an i18n key on technical identifiers.** Stick to
  user-facing display strings. The audit script filters
  single-word identifiers + URL/CSS-like values automatically.
- **Don't deep-clone state objects to swap labels at render
  time.** Use either render-time builder functions, or wrap the
  label string at the JSX consumer.

## Audit-tool false-positive patterns to know

The audit script flags object-literal `label: 'X'` even when the
consumer already wraps it in `tOr()`. So a file like
`PulseView.tsx` still shows 5 candidates after the fix — those
are the const definitions (intentionally English fallback) that
the consumer wraps. The audit count drops only when the source
literal is changed; the visible UI is already translated.

To see actual remaining work, narrow per-file via:

```bash
python3 scripts/audit_hardcoded_english.py path/to/file.tsx
```

and check the line numbers against the consumer-site `.label`
references.

## How to add a new translatable string

```ts
// at JSX consumer
<Chip label={tOr('myCompound.section.key', 'English fallback')} />
```

Then run `python3 scripts/sync_missing_i18n.py` (from flyto-code)
to register the new key in all 4 locales. Translate the new entry
in `flyto-i18n/locales/code/{zh-TW,zh-CN,ja}/code.json`. Rebuild
+ push:

```bash
cd ../flyto-i18n
python3 scripts/build-dist.py
git add -A && git commit -m "i18n: add my new key" && git push
```

CDN propagates ~5 min. Operator browser localStorage may cache
old empty values — `localStorage.clear()` + reload force-flushes.
