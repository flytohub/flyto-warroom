# Flyto2 Contracts

This package is the public protocol surface for Flyto2 integrations.

It is generated from the private Flyto2 engine source by `flyto2-open-core-export`.
It intentionally does not expose engine runtime, handlers, billing, tenant store,
cloud connector implementation, threat-intel datasets, or live remediation
orchestration.

## Contents

- `openapi/flyto-engine.openapi.yaml`: public REST API shape.
- `openapi/flyto-code-observed.openapi.json`: frontend-observed API contract
  placeholders so CE source can verify frontend/backend contract closure without
  exposing private handlers.
- `capabilities/capabilities.yaml`: public capability catalog source.
- `schemas/`: JSON Schemas for extension-facing payloads.
- `examples/`: minimal scanner, runner callback, and evidence examples.
- `conformance/`: zero-dependency validation helper for integration authors.
- `sdk/`: lightweight type stubs for client and connector authors.

## Merge Rule

Change the private Flyto2 source first, rerun the exporter, and review the
generated community delta. Generated copies should not be edited directly.
