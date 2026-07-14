# Flyto2 Warroom CE Frontend Source Boundary

This generated package keeps the CE-exportable Flyto2 Warroom frontend source.
Enterprise and future-only module manifests remain in the private `flyto-code`
workspace and are applied only through paid build-time overlays.

Generated CE source intentionally excludes:

- `src-next/types/module-manifests/enterprise.ts`
- `src-next/types/module-manifests/future.ts`
- Enterprise Control Plane route and view implementation files

Generated CE source keeps `src-next/types/module-manifests/packageManifest.ts`
so CI and contributors can prove each public package can be split, tested, and
merged back into the unified cockpit without importing paid overlays.

The CE package may keep public API client contracts that describe premium
upgrade calls, but it must not ship enterprise control-plane implementation,
commercial data connectors, hosted SaaS control-plane code, or managed
remediation orchestration.
