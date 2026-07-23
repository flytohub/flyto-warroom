# Flyto2 Design Tokens Whitepaper

## Abstract

Flyto2 Design Tokens is the framework-neutral visual contract shared by Flyto2
applications and plugin surfaces. It publishes semantic JavaScript values,
TypeScript declarations, CSS custom properties, and animation keyframes without
owning a component library or application layout.

## Why A Token Contract

Copying colors, spacing, motion, and elevation into each frontend creates
silent drift and makes accessibility changes expensive. A versioned package
lets consumers share stable semantic roles while keeping framework-specific
components and product workflows local.

## Contract Layers

- Color exports define brand scales, dark surfaces, text, border, semantic,
  presence, and resource roles.
- Gradient and elevation exports define approved recipes, focus rings, and
  branded glows.
- Motion exports define durations, easing, names, and keyframes.
- Geometry and typography exports define radii, spacing, layout constants,
  font stacks, and type scales.
- Package exports expose ESM, TypeScript, CSS tokens, animations, and metadata
  through explicit subpaths.

The [API guide](API.md) explains intended usage. The generated
[contract reference](GENERATED_REFERENCE.md) lists every runtime export, CSS
property, keyframe, and package entry point directly from source.

## Consumer Responsibility

Tokens do not guarantee an accessible interface. Consumers must preserve focus
visibility, contrast, reduced-motion behavior, readable density, responsive
layout, and domain-appropriate interaction patterns. Product-specific aliases,
components, and one-off visuals stay in the consuming repository.

## Compatibility

Published names are API. Removing or changing a value requires release review
and coordinated consumer migration. JavaScript, declarations, CSS, and package
metadata must remain in parity. The package has no runtime environment
variables, framework peer dependency, or synchronous CommonJS contract.

## Verification

Dependency-free parity tests load package entry points and compare runtime,
declaration, CSS, and keyframe surfaces. Documentation generation rejects
inventory drift, and package dry runs verify what npm consumers actually
receive.

