# Enterprise Airgap Update Security

Flyto Enterprise airgap updates use signed offline bundles. The bundle verifier lives in engine code so admin import endpoints and release tooling use the same safety rules.

## Bundle Contract

- Schema: `flyto-update-bundle/v1`.
- Signature: Ed25519 over the canonical manifest JSON.
- Required identity: bundle id, version, channel, public key id, creation time.
- Payload references: OCI image digests, policy/rule packs, offline threat-intel bundles, SBOM, checksums, and migration plan.
- Customer data and offline license files are not bundled with updates.

## Apply Rules

- Reject unsigned, tampered, downgraded, checksum-mismatched, or path-traversing bundles.
- Verify every file checksum before extraction or apply.
- Require migration dry-run and backup checkpoint before forward-only database migrations.
- Allow app/policy rollback only when the manifest declares rollback support.
- Keep update signing private keys outside source repositories and CI plaintext variables.

## Release Evidence

- SBOM for every Community and Enterprise artifact.
- Secret scan and dependency license scan for the export/bundle.
- Signature verification log with public key id.
- Image digest list and checksum manifest.
- Admin audit event for import, verification, apply, failure, and rollback.
