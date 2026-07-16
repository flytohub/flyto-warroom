# Flyto2 Frontend Module Boundaries

`LEGACY_MODULE_MAP.json` is the physical migration contract between the current
legacy app tree and the Flyto2 module packages declared in
`src-next/types/module-manifests`.

New product work should land behind one of these package boundaries first, then
move UI files from `legacyPaths` into dedicated module roots as the page is
untangled. CE-exportable packages must not depend on private overlay code.
