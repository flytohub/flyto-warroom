# Flyto2 Design Tokens Feature Reference

## Brand And Semantic Color

The package provides canonical purple/cyan brand scales, secondary accent
colors, dark surfaces, text and border roles, semantic states, presence colors,
and resource categories. Semantic names should be preferred over color names
when the value communicates state.

## Gradient And Node Recipes

Shared gradients cover primary brand actions, accent text/borders, glass cards,
decorative blobs, and workflow-node states. The 135-degree convention keeps
product surfaces coherent; one-off gradients stay local to the consumer.

## Elevation Focus And Motion

Shadows, branded glows, focus rings, motion durations, easing curves, keyframe
names, and complete animation shorthands provide consistent interaction states.
Consumers must honor reduced-motion accessibility where animation is not
essential.

## Shape Spacing Layout And Type

Radii, node shapes, spacing scale, shell dimensions, font stacks, and type sizes
form the shared geometry contract. Product layouts may compose these values but
should not mutate package objects at runtime.

## JavaScript CSS And TypeScript Delivery

The package exposes matching JavaScript values, CSS custom properties, shared
keyframes, and TypeScript declarations. The smoke test verifies entry points and
representative parity so package metadata cannot drift silently from source.
