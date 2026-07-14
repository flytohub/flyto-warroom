# Contributing

Flyto2 Engine changes must preserve route ownership, authorization checks,
PostgreSQL-backed data contracts, and frontend/backend closure.

Before editing:

- Use flyto-indexer search and impact analysis for the target package,
  handler, data model, or migration.
- Check whether the route is registered in `api/router.go`,
  `api/authz_routes_registry.go`, and the OpenAPI spec when applicable.

Before handing off:

```bash
go build ./...
go vet ./...
go test -short -count=1 ./...
PYTHONPATH=../flyto-indexer python3 -m src.cli verify . --query engine --json
```

For frontend/backend work, also run workspace verification from the
`flyto-indexer` sibling checkout.
