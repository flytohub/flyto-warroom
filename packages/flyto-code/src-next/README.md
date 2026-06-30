# src-next

Primary React source tree for Flyto Code. Product code lives in
`components/`, `hooks/`, `lib/`, `types/`, and `utils/`; Fuse template
compatibility code stays under `@fuse/`, `@auth/`, and related prefixed
folders.

Routes are under `app/(control-panel)/` and `app/(public)/`. New product
surfaces should use a route page plus a compound view, then be registered in
the navbar smoke registry and platform loop registry.
