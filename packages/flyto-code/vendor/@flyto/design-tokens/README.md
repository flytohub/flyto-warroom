# Flyto2 Design Tokens

[![npm](https://img.shields.io/npm/v/@flyto2/design-tokens.svg)](https://www.npmjs.com/package/@flyto2/design-tokens)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Website](https://img.shields.io/badge/website-flyto2.com-8B5CF6)](https://flyto2.com)
[![Docs](https://img.shields.io/badge/docs-docs.flyto2.com-06B6D4)](https://docs.flyto2.com)

Canonical design values for the **Flyto2 Platform** — shared between
`flyto-cloud` (Vue 3 + UnoCSS) and `flyto-cortex` (React 19 + Mantine v8 +
Tailwind v4). One source of truth for colours, gradients, shadows,
animations, radii, spacing, typography.

Dark-only. Purple brand (`#8B5CF6`) × cyan accent (`#06B6D4`) × pink/orange
secondary accents.

Use it when a Flyto2 frontend needs shared colors, typography, spacing, motion,
shadow, radius, glass, and glow tokens without copying CSS between apps. It is
the open-source design contract for public sites, Cloud UI, Cortex surfaces,
plugin UIs, and future product shells.

Official links: [flyto2.com](https://flyto2.com) ·
[Docs](https://docs.flyto2.com) ·
[npm](https://www.npmjs.com/package/@flyto2/design-tokens) ·
[flyto-plugins-js](https://github.com/flytohub/flyto-plugins-js)

## Installation

Install the public npm package:

```bash
npm install @flyto2/design-tokens
```

This is an ESM package. Use `import` or a dynamic `import()` from CommonJS; the
package does not claim a synchronous `require()` entry point. Workspace
maintainers testing unreleased changes may temporarily use
`file:../flyto-design-tokens`, but released applications should pin a registry
version through their lockfile.

## Usage

### JavaScript / TypeScript

```ts
import {
  purple, cyan, semantic,
  brandPrimary, glassCard,
  shadowTokens, glow,
  durations, easings, animationShorthands,
  radiiTokens, layout, fonts, typeScale,
} from '@flyto2/design-tokens'

// Mantine theme
createTheme({
  colors: { violet: [/* derive from purple[50..900] */] },
  primaryColor: 'violet',
  defaultRadius: 'lg',
  fontFamily: fonts.sans,
  shadows: shadowTokens,
})

// Inline style
<div style={{ background: glassCard, boxShadow: glow.purple }} />
```

### CSS

```css
@import '@flyto2/design-tokens/css';          /* :root { --flyto-* ... } */
@import '@flyto2/design-tokens/css/animations';

.card {
  background:    var(--flyto-gradient-glass-card);
  border-radius: var(--flyto-radius-2xl);
  box-shadow:    var(--flyto-shadow-card);
  transition:    var(--flyto-transition-normal);
}

.card:hover {
  box-shadow: var(--flyto-shadow-card-hover), var(--flyto-glow-purple);
  animation:  var(--flyto-duration-normal) var(--flyto-ease-standard) flyto-fade-in-up;
}
```

### UnoCSS preset (Cloud)

Map tokens → utilities with a short preset — e.g. `bg-flyto-purple` →
`--flyto-purple-500`, `shadow-flyto-card` → `--flyto-shadow-card`.

## What's inside

| Module        | Contains                                          |
|---------------|---------------------------------------------------|
| `colors`      | purple / cyan / pink / orange scales, semantic,   |
|               | surface, text, border, presence wheel, category   |
| `gradients`   | brand / border-flow / glass / blob / node recipes |
| `shadows`     | elevation scale + branded glows + focus ring      |
| `animations`  | keyframe names, durations, easings, shorthands    |
| `radii`       | rect / node scales                                |
| `spacing`     | spacing scale, layout constants, fonts, type      |

## API

The package exposes four entry points: the ESM/TypeScript root, canonical CSS
variables, shared keyframes, and package metadata. The hand-written
[API reference](docs/API.md) explains compatibility and intended use. The
[generated reference](docs/GENERATED_REFERENCE.md) enumerates all 34 runtime
exports, 129 CSS custom properties, and 12 keyframes directly from source so
individual names cannot silently disappear from documentation.

## Configuration

There are no runtime environment variables, build plugins, provider settings,
or framework peer dependencies. Import the root values into the consumer's
theme system, import CSS once at application entry, and import the animation
subpath only when shared keyframes are used. Consumer-specific aliases and
component styles stay in the consuming application.

## Architecture

`src/` contains framework-neutral JavaScript modules and the matching
`index.d.ts` declarations. `css/` contains the browser contract. Package
`exports` limit supported import paths. `scripts/check-tokens.mjs` validates
runtime/declaration/keyframe parity; `scripts/generate-reference.mjs` creates
the exhaustive source-backed inventory. See [ARCHITECTURE.md](ARCHITECTURE.md)
for ownership and compatibility boundaries.

## Invariants

- **Dark only.** Never add light-mode overrides here. If light ever
  ships, it lives in a separate file + opt-in import.
- **135° gradients** by convention. Anything else is a one-off, not a
  token.
- **No emoji.** Icon semantics belong to each product (cortex uses
  `lucide-react`; cloud uses `lucide-vue-next`).
- **Purple before blue.** `#8B5CF6` is the Flyto2 brand colour; the blue
  in gradients is cyan (`#06B6D4`), never a true blue.

## Changelog

See repo-level CHANGELOG. Bumping a token here is a platform-wide change
— expect both Cloud and Cortex to rebuild their theme shell.

## Testing

```bash
npm run verify
npm audit --audit-level=high
flyto-index verify . --full-scan --strict
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing token additions,
naming changes, docs, or package metadata. Token changes affect multiple Flyto2
frontends, so include consumer impact and visual verification evidence.

## License

Apache-2.0.
