# JavaScript And TypeScript Contract

Each JavaScript module exports plain, immutable-by-convention design values.
`index.js` defines the public ESM surface and `index.d.ts` mirrors every public
name without introducing React, Vue, Mantine, Tailwind, or UnoCSS types.

Run `npm test` after any change. The exact current runtime export inventory is
generated in [`../docs/GENERATED_REFERENCE.md`](../docs/GENERATED_REFERENCE.md).
