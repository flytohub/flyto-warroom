# Flyto2 Design Tokens API

The package has four public entry points:

| Import | Purpose |
|---|---|
| `@flyto2/design-tokens` | JavaScript values and TypeScript declarations. |
| `@flyto2/design-tokens/css` | Canonical `--flyto-*` custom properties. |
| `@flyto2/design-tokens/css/animations` | Shared `flyto-*` keyframe definitions. |
| `@flyto2/design-tokens/package.json` | Package metadata for compatible tooling. |

The root entry is ESM-only. CommonJS callers must use dynamic `import()`; there
is no synchronous `require()` compatibility claim.

## JavaScript Exports

### Colors

- `purple`, `cyan`, `pink`, `orange`: brand and accent scales.
- `semantic`: success, warning, error, and information colors.
- `surface`: dark application surfaces.
- `text`: text and link colors for dark surfaces.
- `border`: default, light, focus, and handle borders.
- `presence`: stable six-color collaboration palette.
- `category`: document, code, media, data, config, and archive colors.
- `colors`: namespace containing the color module.

### Gradients

- `brandPrimary`, `brandAccent`, and `borderFlow`.
- `glassCard` and `glassCardHover`.
- The `gradients` namespace additionally exposes blob and node-state recipes.

### Elevation And Focus

- `shadowTokens`: neutral elevation and card/popup shadows.
- `focusRing`: canonical keyboard focus reinforcement.
- `glow`: purple, cyan, pink, orange, success, and error glows.
- `shadows`: namespace containing the shadow module.

### Motion

- `durations`: fast, normal, slow, and very-slow timings.
- `easings`: standard, emphasized, overshoot, and linear curves.
- `keyframeNames`: CSS animation-name strings.
- `animationShorthands`: complete values suitable for the CSS `animation`
  property.
- `animations`: namespace containing the motion module.

Consumers using a keyframe name or shorthand must also import the animations
CSS entry point.

### Shape Spacing And Typography

- `radiiTokens` and `nodeRadii`.
- `spacingTokens`, `layout`, `fonts`, and `typeScale`.
- `radii` and `spacing` namespace exports.

## CSS Contract

`css/tokens.css` defines dark-mode custom properties grouped by color,
semantics, surfaces, text, borders, presence, categories, gradients, node
states, radii, shadows, glows, typography, layout, and motion. Consumers may
define local aliases but should not copy literal canonical values.

`css/animations.css` defines the names referenced by `keyframeNames`. The
`flyto-` prefix is retained as a CSS compatibility namespace; product copy and
package naming remain Flyto2.

## TypeScript Contract

`src/index.d.ts` is the public declaration file. New JavaScript exports must be
added to it in the same change. Framework-specific Mantine, Tailwind, Vue,
React, or UnoCSS types must not leak into this framework-neutral package.

## Compatibility

- Token names are API. Renaming or removing one is a breaking change.
- Adding a scale member is normally additive but may affect generated themes.
- Changing a value is visually breaking even when the JavaScript type is
  unchanged; verify every consuming Flyto2 surface.
- Light mode, if introduced, must be an explicit opt-in entry point rather than
  an implicit override of the current dark contract.

The exhaustive current name/value inventory is generated at
[`GENERATED_REFERENCE.md`](GENERATED_REFERENCE.md). Run
`npm run docs:generate` after changing exports, package entry points, CSS custom
properties, or keyframes.
