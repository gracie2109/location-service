# location-service

Standalone service for Vietnamese administrative units: current and historical catalog,
search with or without diacritics, successor relations and carrier code mappings.
It does not depend on any consumer application.

- Design: [docs/kien-truc.md](docs/kien-truc.md)
- Public contract: [openapi/openapi.yaml](openapi/openapi.yaml) (OpenAPI 3.1)

## Status

Steps S1 (scaffold), S2 (schema), S3 (read API under `/api/v1`) and S4 (import CLI) are done.
`/ready` and the read endpoints answer 503 until a catalog has been imported (step S5, which needs
the official data file). No catalog data is included or invented; tests use fixtures marked as such.
Import format and commands: [docs/import.md](docs/import.md).

Provider endpoints (`/locations/{code}/provider-codes`, `/provider-codes/...`, `/catalog/snapshot`)
need an API key. Create one with `npm run api-keys -- create --name <client> --scopes provider-codes:read`
(printed once, only a hash is stored); `revoke` and `list` are the other commands. Public routes are
limited per IP (`PUBLIC_RATE_LIMIT_PER_MIN`), keys per client; set `TRUST_PROXY_HOPS` behind a proxy.

## Develop

```bash
cp .env.example .env
npm ci
npm run start:dev      # http://localhost:3000/health
npm run lint && npm run typecheck && npm test && npm run build && npm run lint:openapi
docker compose up -d db   # PostgreSQL 16
export DATABASE_URL=postgres://location:location@localhost:5432/location
npm run migrate           # npm run migrate:down rolls the last migration back
TEST_DATABASE_URL=$DATABASE_URL npm test   # database tests are skipped without it
```

Configuration is read and validated in `src/config/env.ts`; the service refuses to start on
invalid values. Errors are returned as `application/problem+json`.

GHN mapping: `npm run providers -- ghn sync` (needs `GHN_TOKEN` and `GHN_SHOP_ID`, only sends GET requests,
dry run unless `--apply`) records what GHN's two-level master data contains as proposals; a person confirms
them with `ghn confirm` / `ghn reject`. GHN returns no state code, so nothing is linked automatically.
When a unit is merged or GHN changes a code, `ghn replace` moves the GHN code to another unit and `ghn deactivate`
switches a mapping off; both keep the old row with who, when and why. The import report lists live mappings on
retired units (`provider_mappings_to_review`).
