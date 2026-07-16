# STATE.md

Last reviewed: 2026-07-16

## Current State

`flyto-warroom` is part of the 27-repository Flyto2 workspace memory standardization.

The bundled `packages/flyto-code` CE frontend now mirrors the upstream
`flyto-code` public CE package-manifest API. CE route/package split helpers are
available through `@code/modules`, and product-loop audits read the physical
module manifest files rather than the compatibility re-export shim.

## Known Risks

- Keep public copy aligned with Flyto2 naming and current URLs.
- Keep frontend changes aligned with accessibility, responsive design, visual hierarchy, navigation, and content clarity standards.

## Verification

Record the latest relevant build, test, lint, deploy, or publish checks here.
