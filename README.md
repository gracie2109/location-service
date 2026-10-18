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
