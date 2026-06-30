# Flyto Code Visual System

Flyto Code is a dense security workbench. It should feel like a SOC console
and enterprise operator surface: quiet, compact, stable, and evidence-first.
It is not a marketing page, a terminal-themed demo, or a collection of
domain-specific mini-products.

## Required Page Contract

Every workspace route must render through `PageShell` or an approved
PageShell-backed war-room wrapper. Every compound view should use:

- `FlytoPageHeader` for page title, subtitle, count chip, tabs, and actions.
- `FlytoSurface` for panels, evidence blocks, control sections, and state cards.
- `TabBar` for tabs.
- `KpiCard` for manager-grade metric tiles.
- `FlytoMetricTile` / `FlytoMetricGrid` for compact evidence and control-plane
  metric blocks.
- `DataTable` for dense engineer-mode tables.

Direct MUI `Paper` and `Card` are allowed inside atoms/shared primitives, chart
libraries, and legacy views under active migration. New product views should
not introduce new top-level `Paper`/`Card` shells.

## Page Types

- `ManagerPage`: executive overview, KPIs, high-level decisions.
- `WorkbenchPage`: dense operator control plane with filters and tables.
- `EvidencePage`: replay, DOM, screenshot, network, audit trail, signatures.
- `ReportPage`: deliverables and export preview.
- `WizardPage`: guided setup, connector onboarding, approvals.

Each route must pick one dominant page type. Mixing several page languages on
one screen is the main source of the "independent pages" feel.

## Styling Rules

- Use `src-next/styles/designTokens.ts` for product colors.
- Use `src-next/styles/visualSystem.ts` for typography, font family, spacing,
  radius, icon sizing, motion, and surface density.
- Use semantic tones for success, warning, danger, info, and severity.
- Keep cards and panels at 8px radius or less. In MUI `sx`, this means
  `borderRadius: 1` or `2`; prefer `1` for dense workbench panels.
- Do not use page-specific glow, bokeh, decorative gradients, or terminal
  headers. Terminal styling belongs only in log/code/evidence panes.
- Do not scale font sizes with viewport width.
- Keep letter spacing at `0` unless the text is a small overline/status label.
- Prefer compact grids, stable row heights, and visible scroll ownership.

## Guardrail

Run:

```bash
npm run audit:visual-system
```

The audit writes:

- `reports/visual-system-audit.json`
- `reports/visual-system-audit.md`

The budgets are a regression gate. They start from the current legacy surface
area and should only move downward as views migrate to shared primitives.

The guard also checks that core primitives consume `visualSystem.ts`, so
changing `pageTitle`, `surfaceTitle`, `surfacePadding`, `surface`, `control`,
or `metricValue` updates the platform consistently instead of requiring a
search-and-edit pass across every product page.
