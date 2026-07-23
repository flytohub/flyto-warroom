# Agent Instructions

This repository is a generated Flyto2 Warroom CE mirror. Do not treat it as the
private Flyto2 source of truth.

## Before Changes

- Identify whether the change belongs to `flyto-code`, `flyto-contracts`,
  `flyto-engine-ce`, or generated release files. No other Flyto repository is a
  CE implementation source.
- Prefer `flyto-indexer` search, impact, audit, and verify workflows for code
  exploration when the tool is available.
- If a generated file needs a lasting change, update the source package or the
  exporter template first, then regenerate this repository.

## Safety

- Do not commit credentials, customer data, private image coordinates, private
  connector secrets, or enterprise-only implementation details.
- Keep Enterprise features connected only through public capabilities, public
  API/evidence contracts, signed bridge requests, and gated UI states.
- Premium paths must fail closed when entitlement, permission, connector, cloud,
  or evidence-signature checks fail.

## After Changes

Run the relevant verification before committing:

```sh
make audit
python3 install/scripts/verify-docker-images.py --dry-run
```

The exporter that generates this repository lives in the private
`flyto-engine/release` tooling, not in this tree — change it there and
regenerate.

## Flyto2 Project Memory Contract

Every Flyto2 repository must keep this project-memory scaffold current:

- `AGENTS.md`: agent operating rules, repo-specific constraints, verification commands.
- `CLAUDE.md`: Claude-facing handoff rules when this repo is edited outside Codex.
- `PROJECT.md`: product purpose, owned surfaces, users, and non-goals.
- `ARCHITECTURE.md`: module boundaries, runtime shape, data flow, and integration points.
- `STATE.md`: current status, known risks, release/deploy state, and last verification.
- `ROADMAP.md`: near-term, later, and explicitly out-of-scope work.
- `tasks.md`: actionable checklist with owners/status when known.
- `DECISIONS.md`: durable architectural/product decisions with dates and rationale.
- `CHANGELOG.md`: user-visible or operator-visible changes.
- `docs/README.md`: index for durable docs in this repo.
- `workflows/*.md`: repeatable agent workflows for idea capture, planning, implementation, bugfix, refactor, investigation, and wrap-up.
- `handoffs/_registry.md`: index of handoffs; new handoffs use `YYYY-MM-DD-topic.md`.

When changing behavior, public copy, deployment, security posture, or frontend
UX, update the relevant memory files in the same change. Do not leave stale
brand, email, module count, route, or deployment information behind.

## Flyto2 Frontend Quality Gate

Any frontend, website, dashboard, extension webview, app screen, or generated UI
in this repository must avoid these eight failures:

1. Ignoring accessibility: every interactive control needs keyboard access, visible focus, semantic HTML or ARIA, sufficient contrast, and useful alt/labels.
2. Missing responsive design: verify mobile, tablet, and desktop; no clipped text, overflow, hidden primary actions, or broken navigation.
3. Weak visual hierarchy: users must immediately see page purpose, primary action, status, and next step.
4. Template-looking UI: reuse Flyto2 design tokens and local components, but tailor layout and copy to the actual product surface.
5. Useless elements: remove decorative or placeholder UI that does not help the workflow, trust, navigation, or comprehension.
6. Unclear hierarchy: controls, cards, tables, panels, and modals must have clear grouping, spacing, headings, and state.
7. Unintuitive navigation: current location, back/forward paths, and cross-links to docs/blog/product pages must be obvious.
8. Hard-to-understand content: copy must be concrete, scannable, current, and consistent with Flyto2 terminology.

Frontend verification must include the relevant automated checks plus manual or
screenshot review for responsive layout, accessibility states, navigation
clarity, loading/empty/error states, and content readability. Public pages must
preserve SEO basics: canonical URL, sitemap coverage, metadata, structured data
when relevant, and no broken internal or external links.
