# src-next

Primary React source tree for Flyto2 Code. Product code lives in
`components/`, `hooks/`, `lib/`, `types/`, and `utils/`; Fuse template
compatibility code stays under `@fuse/`, `@auth/`, and related prefixed
folders.

Routes are under `app/(control-panel)/` and `app/(public)/`. New product
surfaces should use a route page plus a compound view, then be registered in
the navbar smoke registry and platform loop registry.

Physical route/capability/package manifests live under
`types/module-manifests/`. Engine and Cloud transport must remain under
`lib/engine/` and `lib/cloud/`; views do not call transport directly. The UI
supports light, dark, and system appearance through semantic tokens.

Detailed ownership and method-level references:

- [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
- [`../docs/FRONTEND.md`](../docs/FRONTEND.md)
- [`../docs/API_CLIENTS.md`](../docs/API_CLIENTS.md)
- [`../docs/reference/source-api.md`](../docs/reference/source-api.md)
