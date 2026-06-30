# Reports PDF Export — Data Source Registry Audit — 2026-05-29

Source: `src-next/components/compounds/reports/templates.ts` (19 preset templates).

PR-5A wired the Reports PDF export to backend `POST /reports/build` and added a blocking dialog that lists every widget whose data source isn't in the backend's registry. Without that gate the backend silently dropped sections; with it, the operator sees the truth — but right now most preset templates have at least one unsupported widget, so most exports get blocked.

This audit walks every preset, classifies every widget, and tells you per template:

- **EXPORTS** — would pass the block today (text / chart-image / supported KPI / supported table)
- **BLOCKS** — would trigger the dialog (unsupported `dataSourceId` for KPI / table, or JOIN widget)

Plus a per-data-source rollup so PR-5C (backend) and PR-5B-impl (frontend preset rewrites) can each see exactly what to fix.

Doc-only — no source changes from this audit.

---

## 1. Reference tables

### 1.1 Backend `BACKEND_SUPPORTED_SOURCES` (17 IDs, from `api/report_engine.go:getDataSourceRegistry()`)

| Source ID | Surface | Notes |
|---|---|---|
| `computed-score` | cross-surface | Org-aggregate posture score |
| `score-history` | cross-surface | Daily score timeline |
| `health-summary` | code | Per-repo health rollup |
| `cve` | code | CVE findings (filterable by severity) |
| `alerts` | code | Code alerts (security + quality) |
| `repos` | code | Connected-repo inventory |
| `top-risks` | code | Top N risk repos |
| `attack-surface` | external | Discovered external assets |
| `dast-findings` | external | DAST scan findings |
| `external-issues` | external | Open external issue tracker rows |
| `ioc` | external | Indicators of compromise |
| `brand-protection` | external | Lookalike / takedown |
| `vendor-risk` | external | Supply-chain vendor scores |
| `compliance` | cross-surface | Multi-framework compliance status |
| `ransomware` | external | ransomware.live catalog |
| `threat-actors` | catalog | MITRE ATT&CK groups |
| `malware-families` | catalog | MITRE ATT&CK software |

### 1.2 Frontend data source IDs found in `templates.ts`

Used + supported (will export when the widget type also matches):

`computed-score`, `score-history`, `health-summary`, `attack-surface`

Used + **NOT supported** (KPI/table widgets pointing here will block export):

`issues`, `pulse`, `scan-diff`, `containers`, `enriched-deps`, `taint-flows`, `iac`, `autofix`, `autofix-runs`, `ci-checks`, `licenses`, `dependencies`, `arch-map`, `api-definitions`, `dead-code`, `cspm`, `pentest-projects`, `monitoring-events`, `scan-log`, `score-events`, `runtime-events`, `malware`

That's **22 frontend-only IDs** with no backend `data_source` equivalent today. Charts using these still export via the image-only path; KPI and table widgets do not.

---

## 2. Per-template verdict

Legend:
- **✓ chart-image** — exports (screenshot)
- **✓ text** — exports (static content)
- **✓ kpi/table** — exports (data source is in backend registry)
- **✗ unsupported-source** — blocked (KPI/table on a non-registered data source)

For chart widgets the `dataSourceId` doesn't affect exportability (image-only), but it's listed so PR-5C planners can see which sources charts also depend on at runtime.

### 2.1 `security-audit` (Security Audit Report)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-intro | text | — | ✓ text |
| w1 Unified Score | radialBar | `computed-score` | ✗ unsupported-source (`radialBar` ⇒ kpi rules; backend HAS computed-score so this would pass IF radialBar mapped to kpi — confirm) |
| w2 Grade Distribution | donut | `health-summary` | ✓ chart-image |
| w3 Total CVEs | kpi | `health-summary` | ✓ kpi |
| w4 Severity Distribution | bar | `issues` | ✓ chart-image |
| w5 Issue Types | donut | `issues` | ✓ chart-image |
| w-risk-note | text | — | ✓ text |
| w6 Top Findings by Blast Radius | table | `pulse` | ✗ unsupported-source (`pulse`) |

**Export today: BLOCKED** — w1 (radialBar treated as kpi by `classifyWidget`, gates on supported source — `computed-score` IS supported so this actually PASSES; double-check via tests) AND w6 (table on `pulse`).

> ⚠️ Clarification on w1: `classifyWidget` puts `radialBar` in `KPI_TYPES` and requires the source to be in `BACKEND_SUPPORTED_SOURCES`. `computed-score` IS supported. So w1 actually EXPORTS as kpi. The blocker is w6 alone.

### 2.2 `security-trend` (Security Trend Analysis)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-trend-intro | text | — | ✓ text |
| w1 Current Score | gauge | `health-summary` | ✓ kpi (gauge classified as kpi; health-summary supported) |
| w2 Scan Delta | bar | `scan-diff` | ✓ chart-image |
| w3 Score by Repository | bar | `health-summary` | ✓ chart-image |

**Export today: EXPORTS** ✓ (every widget either text, supported kpi, or chart-image)

### 2.3 `vulnerability-assessment` (VA)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-va-scope | text | — | ✓ text |
| w1 CVE Severity | donut | `issues` | ✓ chart-image |
| w2 CVEs by Repo | bar | `issues` | ✓ chart-image |
| w3 Container Vulns | bar | `containers` | ✓ chart-image |
| w4 Dep Blast Radius | bar | `enriched-deps` | ✓ chart-image |
| w-sla-note | text | — | ✓ text |
| w5 All Vulnerabilities | table | `issues` | ✗ unsupported-source (`issues`) |

**Export today: BLOCKED** (w5 — table on `issues`)

### 2.4 `ctem-posture` (CTEM Posture)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-ctem-intro | text | — | ✓ text |
| w1 External Score | radialBar | `computed-score` | ✓ kpi |
| w2 Asset Types | donut | `attack-surface` | ✓ chart-image |
| w3 Asset Status | bar | `attack-surface` | ✓ chart-image |
| w4 Discovered Assets | table | `attack-surface` | ✓ table |
| w-validation | text | — | ✓ text |

**Export today: EXPORTS** ✓

### 2.5 `ctem-pentest` (Pentest Campaign)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-pentest-scope | text | — | ✓ text |
| w1 Asset Types | donut | `attack-surface` | ✓ chart-image |
| w2 Finding Status | bar | `attack-surface` | ✓ chart-image |
| w3 Active Findings | kpi | `pulse` | ✗ unsupported-source (`pulse`) |
| w4 Discovered Assets | table | `attack-surface` | ✓ table |

**Export today: BLOCKED** (w3 — kpi on `pulse`)

### 2.6 `compliance-owasp` (OWASP Top 10)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-owasp-intro | text | — | ✓ text |
| w1 Severity Split | donut | `issues` | ✓ chart-image |
| w2 Finding Types | bar | `issues` | ✓ chart-image |
| w3 Taint Categories | treemap | `taint-flows` | ✓ chart-image |
| w4 Blast by Severity | radar | `issues` | ✓ chart-image |
| w5 All Findings | table | `issues` | ✗ unsupported-source (`issues`) |

**Export today: BLOCKED** (w5)

### 2.7 `compliance-iso27001`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-iso-intro | text | — | ✓ text |
| w1 (untitled) | radialBar | `health-summary` | ✓ kpi |
| w2 IaC by Severity | donut | `iac` | ✓ chart-image |
| w3 AutoFix Candidates | kpi | `autofix` | ✗ unsupported-source (`autofix`) |
| w4 IaC Frameworks | treemap | `iac` | ✓ chart-image |
| w5 Container Vulns | bar | `containers` | ✓ chart-image |
| w6 IaC Findings | table | `iac` | ✗ unsupported-source (`iac`) |

**Export today: BLOCKED** (w3, w6)

### 2.8 `compliance-soc2`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-soc2-intro | text | — | ✓ text |
| w1 Org Health | radialBar | `health-summary` | ✓ kpi |
| w2 CI Gate Results | donut | `ci-checks` | ✓ chart-image |
| w3 Issue Severity | bar | `issues` | ✓ chart-image |
| w4 AutoFix Status | donut | `autofix` | ✓ chart-image |

**Export today: EXPORTS** ✓

### 2.9 `compliance-multi`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-multi-intro | text | — | ✓ text |
| w1 Unified Score | radialBar | `computed-score` | ✓ kpi |
| w2 Finding Severity | donut | `issues` | ✓ chart-image |
| w3 Auto-Remediable | kpi | `autofix` | ✗ unsupported-source (`autofix`) |
| w4 By Framework | bar | `iac` | ✓ chart-image |
| w5 By Finding Type | bar | `issues` | ✓ chart-image |
| w-evidence | text | — | ✓ text |

**Export today: BLOCKED** (w3)

### 2.10 `license-sbom` (Licenses & SBOM)

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 License Distribution | donut | `licenses` | ✓ chart-image |
| w2 Risk Levels | bar | `licenses` | ✓ chart-image |
| w3 Dependency Usage | treemap | `dependencies` | ✓ chart-image |
| w4 Shared Packages | bar | `dependencies` | ✓ chart-image |
| w-license-note | text | — | ✓ text |
| w5 License Issues | table | `licenses` | ✗ unsupported-source (`licenses`) |

**Export today: BLOCKED** (w5)

### 2.11 `cve-database`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 CVE Severity | donut | `issues` | ✓ chart-image |
| w2 CVEs by Repo | bar | `issues` | ✓ chart-image |
| w3 Container Images | treemap | `containers` | ✓ chart-image |
| w4 Dep Blast Radius | bar | `enriched-deps` | ✓ chart-image |
| w5 All CVEs | table | `issues` | ✗ unsupported-source (`issues`) |

**Export today: BLOCKED** (w5)

### 2.12 `ci-history`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Pass/Fail Ratio | donut | `ci-checks` | ✓ chart-image |
| w2 Findings by Branch | bar | `ci-checks` | ✓ chart-image |
| w3 Check History | table | `ci-checks` | ✗ unsupported-source (`ci-checks`) |

**Export today: BLOCKED** (w3)

### 2.13 `arch-overview`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-arch-intro | text | — | ✓ text |
| w1 Project Types | donut | `arch-map` | ✓ chart-image |
| w2 Repo Size Distribution | bar | `arch-map` | ✓ chart-image |
| w3 Dependency Usage | treemap | `dependencies` | ✓ chart-image |
| w4 API Methods | donut | `api-definitions` | ✓ chart-image |
| w5 Repo Architecture Map | table | `arch-map` | ✗ unsupported-source (`arch-map`) |

**Export today: BLOCKED** (w5)

### 2.14 `code-quality`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Dead Code by Type | donut | `dead-code` | ✓ chart-image |
| w2 Dead Code Count | kpi | `dead-code` | ✗ unsupported-source (`dead-code`) |
| w3 Complex Functions | bar | `arch-map` | ✓ chart-image |
| w4 Taint Categories | donut | `taint-flows` | ✓ chart-image |
| w5 Taint Flows by Severity | bar | `taint-flows` | ✓ chart-image |
| w6 Dead Code Inventory | table | `dead-code` | ✗ unsupported-source (`dead-code`) |
| w7 Taint Flow Paths | table | `taint-flows` | ✗ unsupported-source (`taint-flows`) |

**Export today: BLOCKED** (w2, w6, w7)

### 2.15 `container-security`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-container-intro | text | — | ✓ text |
| w1 Severity Distribution | donut | `containers` | ✓ chart-image |
| w2 Findings by Image | bar | `containers` | ✓ chart-image |
| w3 Total Container CVEs | kpi | `containers` | ✗ unsupported-source (`containers`) |
| w4 Affected Packages | treemap | `containers` | ✓ chart-image |
| w5 All Container Findings | table | `containers` | ✗ unsupported-source (`containers`) |

**Export today: BLOCKED** (w3, w5)

### 2.16 `iac-security`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Severity Split | donut | `iac` | ✓ chart-image |
| w2 By Framework | donut | `iac` | ✓ chart-image |
| w3 By Resource Type | bar | `iac` | ✓ chart-image |
| w4 All IaC Findings | table | `iac` | ✗ unsupported-source (`iac`) |

**Export today: BLOCKED** (w4)

### 2.17 `cspm-report`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-cspm-intro | text | — | ✓ text |
| w1 By Provider | donut | `cspm` | ✓ chart-image |
| w2 By Severity | bar | `cspm` | ✓ chart-image |
| w3 By Resource | donut | `cspm` | ✓ chart-image |
| w4 All CSPM Findings | table | `cspm` | ✗ unsupported-source (`cspm`) |

**Export today: BLOCKED** (w4)

### 2.18 `autofix-report`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-autofix-intro | text | — | ✓ text |
| w1 Patch Status | donut | `autofix` | ✓ chart-image |
| w2 By Severity | bar | `autofix` | ✓ chart-image |
| w3 AutoFix Candidates | kpi | `autofix` | ✗ unsupported-source (`autofix`) |
| w4 AutoFix Run History | table | `autofix-runs` | ✗ unsupported-source (`autofix-runs`) |
| w5 All AutoFix Findings | table | `autofix` | ✗ unsupported-source (`autofix`) |

**Export today: BLOCKED** (w3, w4, w5)

### 2.19 `external-posture`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-ext-intro | text | — | ✓ text |
| w1 Asset Types | donut | `attack-surface` | ✓ chart-image |
| w2 Project Types | donut | `pentest-projects` | ✓ chart-image |
| w3 By Criticality | bar | `pentest-projects` | ✓ chart-image |
| w4 Pentest Projects | table | `pentest-projects` | ✗ unsupported-source (`pentest-projects`) |
| w5 Attack Surface Assets | table | `attack-surface` | ✓ table |

**Export today: BLOCKED** (w4)

### 2.20 `monitoring-report`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Events by Severity | bar | `monitoring-events` | ✓ chart-image |
| w2 Event Types | donut | `monitoring-events` | ✓ chart-image |
| w3 All Monitoring Events | table | `monitoring-events` | ✗ unsupported-source (`monitoring-events`) |

**Export today: BLOCKED** (w3)

### 2.21 `score-trends`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Score History (30d) | line | `score-history` | ✓ chart-image |
| w2 Score by Category | bar | `computed-score` | ✓ chart-image |
| w3 Scan Delta | bar | `scan-diff` | ✓ chart-image |
| w4 Grade Change Events | table | `score-events` | ✗ unsupported-source (`score-events`) |

**Export today: BLOCKED** (w4)

### 2.22 `scan-activity`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Scan Status | donut | `scan-log` | ✓ chart-image |
| w2 Trigger Types | donut | `scan-log` | ✓ chart-image |
| w3 CI Gate Results | donut | `ci-checks` | ✓ chart-image |
| w4 Scan Activity Log | table | `scan-log` | ✗ unsupported-source (`scan-log`) |

**Export today: BLOCKED** (w4)

### 2.23 `runtime-security`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w1 Event Types | donut | `runtime-events` | ✓ chart-image |
| w2 Threats Detected | bar | `runtime-events` | ✓ chart-image |
| w3 Runtime Events | table | `runtime-events` | ✗ unsupported-source (`runtime-events`) |

**Export today: BLOCKED** (w3)

### 2.24 `malware-report`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-malware-intro | text | — | ✓ text |
| w1 Malware Scan Results | table | `malware` | ✗ unsupported-source (`malware`) |

**Export today: BLOCKED** (w1)

### 2.25 `risk-matrix`

| Widget | type | dataSourceId | Verdict |
|---|---|---|---|
| w-matrix-intro | text | — | ✓ text |
| w1 Risk by Severity | radar | `issues` | ✓ chart-image |
| w2 Blast Radius by Severity | bar | `pulse` | ✓ chart-image |
| w3 Highest Risk Findings | table | `pulse` | ✗ unsupported-source (`pulse`) |

**Export today: BLOCKED** (w3)

---

## 3. Aggregate findings

### 3.1 Headline numbers

- **19 preset templates** total
- **3 export today** ✓ (`security-trend`, `ctem-posture`, `compliance-soc2`)
- **16 blocked** by at least one unsupported KPI/table widget

### 3.2 Most-blocked data sources (KPI/table widgets pointing here)

Sorted by how many preset templates would unblock if this single source landed in the backend registry:

| Source ID | Preset templates blocked by this | Charts that also use it (already export) |
|---|---|---|
| `issues` | 4 (security-audit, vulnerability-assessment, compliance-owasp, cve-database) | 8 templates |
| `autofix` | 3 (compliance-iso27001, compliance-multi, autofix-report) | 1 template |
| `pulse` | 3 (security-audit, ctem-pentest, risk-matrix) | 1 template |
| `iac` | 2 (compliance-iso27001, iac-security) | 4 templates |
| `containers` | 1 (container-security) | 3 templates |
| `dead-code` | 1 (code-quality, multi-widget) | 1 template |
| `taint-flows` | 1 (code-quality) | 2 templates |
| `ci-checks` | 1 (ci-history) | 3 templates |
| `licenses` | 1 (license-sbom) | 1 template |
| `arch-map` | 1 (arch-overview) | 2 templates |
| `pentest-projects` | 1 (external-posture) | 1 template |
| `monitoring-events` | 1 (monitoring-report) | 1 template |
| `score-events` | 1 (score-trends) | — |
| `scan-log` | 1 (scan-activity) | — |
| `runtime-events` | 1 (runtime-security) | 1 template |
| `malware` | 1 (malware-report) | — |
| `autofix-runs` | 1 (autofix-report) | — |
| `cspm` | 1 (cspm-report) | — |

**Top backend-add candidate: `issues`** — adding ONE source to backend registry unblocks 4 preset templates immediately. The runner-up is `pulse` / `autofix` (3 each). After those, every other source unblocks only its single dedicated template.

### 3.3 Used-but-unsupported data sources with NO preset template blocker

Sources that templates use ONLY in chart positions (so backend NEVER needs them — frontend uses the image-only path):

`scan-diff`, `enriched-deps`, `dependencies`, `api-definitions`

These four can stay frontend-only forever — they will never block an export.

---

## 4. Next-PR sequence

Each line is sized to fit a single focused PR.

1. **[FE — PR-5B-1] Rewrite `compliance-soc2` and `ctem-posture` templates** to add a `top-risks` or `attack-surface` table widget so users have a non-trivial export path that proves the new flow works end-to-end. Already exports today but the table content is thin.
2. **[FE — PR-5B-2] Rewrite preset templates that fail JUST because of one unsupported KPI/table widget** to either (a) drop the offending widget, (b) replace its `dataSourceId` with a supported equivalent (e.g. `issues` table → `cve` table for CVE-focused presets), or (c) demote the widget to a chart so it rides on the image-only path. Candidates: `compliance-iso27001` (replace `autofix` kpi with chart; replace `iac` table with `cve` filtered table if filters land), `compliance-multi` (drop `autofix` kpi), `risk-matrix` (drop `pulse` table or replace with `external-issues`), `external-posture` (drop `pentest-projects` table).
3. **[FE — PR-5B-3] Drop or rewrite presets with no reasonable substitute today**: `code-quality`, `container-security`, `cspm-report`, `autofix-report`, `runtime-security`, `malware-report`, `arch-overview`, `iac-security`, `monitoring-report`, `scan-activity`, `score-trends`. Either remove the table/KPI widgets entirely (so the preset becomes a chart-only dashboard PDF — still useful) or mark the preset as "waiting on backend".
4. **[BE — PR-5C-1] Add `pulse` to backend `data_source` registry.** Unblocks 3 templates AND the most cross-dim-meaningful Pulse widgets in security-audit / risk-matrix / ctem-pentest.
5. **[BE — PR-5C-2] Add `iac`, `containers`, `autofix`, `autofix-runs`** as backend `data_source` entries (4 sources, ~6 templates impacted).
6. **[BE — PR-5C-3] Add `dead-code`, `taint-flows`, `licenses`, `arch-map`, `api-definitions`, `dependencies`** for the architecture / code-quality / OSS-licensing reports. Lower priority — these are dev-facing reports not customer-facing.
7. **[BE — PR-5C-4] Add `monitoring-events`, `scan-log`, `score-events`, `runtime-events`, `malware`, `cspm`, `pentest-projects`, `ci-checks`** for the long-tail reports. Lowest priority.
8. **[FE — PR-5B-4] Once PR-5C-1 lands**, drop the new `pulse` widget restrictions and re-promote any preset that was rewritten in PR-5B-2 to drop a `pulse` widget.

Items 1–3 are frontend-only and can land in any order. Items 4–7 are backend PRs. Item 8 depends on item 4.

### 4.1 Suggested ordering rationale

- **Ship FE first (items 1–3)** so customers get exports today on the templates that already work + on rewritten presets.
- **BE catches up (4–7)** at whatever pace the backend team has bandwidth.
- **FE follow-up (8)** as each BE item lands — small per-PR delta.

This unblocks customer-visible exports immediately without waiting on backend, then steadily adds back the richer presets.
