# Architecture

The package exposes plain JavaScript values from `src/`, matching TypeScript
declarations in `src/index.d.ts`, CSS custom properties in `css/tokens.css`, and
keyframes in `css/animations.css`. It has no framework runtime dependency.

Boundary:

- Product lines: cloud_apps_automation, security, data, zero_person_agent, big_data_intelligence
- Core relationship: design system support
- This repo must not bypass shared `flyto-core` runtime boundaries.
- SaaS, enterprise, community, and internal-only behavior must remain explicit.
- Token names and package subpaths are public compatibility boundaries.
- Consumer-specific aliases and component styles belong in the consuming repo.

Update this file when package exports, deployment mode, provider boundaries, or
cross-repo dependencies change.
