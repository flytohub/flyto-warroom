# CSS Contract

`tokens.css` defines the canonical dark-first `--flyto-*` custom properties.
`animations.css` defines shared `flyto-*` keyframes. Consumers import the token
entry once and import animations only when they use a shared keyframe or
animation shorthand.

Names are public compatibility boundaries. Values may be composed into local
aliases, but consumer-specific component rules do not belong in this package.
