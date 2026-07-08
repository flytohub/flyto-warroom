# Contributing to Flyto2 Warroom CE

Thanks for your interest. Please read this before opening a PR.

## This repository is a generated downstream mirror

The Community Edition is **exported one-way** from the upstream Flyto2 source of
truth. This repository is **not hand-edited** — any direct commit here is
overwritten on the next export.

Because of that, a PR opened against this repo is **not merged directly**.
Instead:

1. You open a PR here (or an issue describing the change).
2. A maintainer reviews it.
3. If accepted, the maintainer **ports the change upstream** into the private
   source of truth.
4. The change flows back into this repository on the next Community export —
   with attribution to you.

Where possible, discuss non-trivial changes in an issue first so we can confirm
the change belongs in the open-core edition (vs. the commercial edition) before
you invest effort.

## Contributor License Agreement (required)

Before your contribution can be accepted, you must agree to the Contributor
License Agreement in **`CLA.md`**. This lets the maintainers keep your
contribution maintainable across **both** the community (Apache-2.0) and
commercial editions of the product.

- Automated check: our CLA bot comments on your first PR with a one-time signing
  link. The PR cannot be merged/ported until the check is green.
- One signature covers all your future contributions.

If you are contributing on behalf of a company, an authorized representative must
sign the entity CLA.

## Ground rules

- Keep changes scoped to the open-core surface (scanner / detection). Changes
  that reach into commercial-only areas will be redirected.
- Match the surrounding code style; include tests where the area has them.
- No secrets, credentials, or customer data in commits.
- By submitting, you certify the contribution is your own work (or you have the
  right to submit it) and you agree to the CLA.
