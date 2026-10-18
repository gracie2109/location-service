# location-service

Standalone service for Vietnamese administrative units: current and historical catalog,
search with or without diacritics, successor relations and carrier code mappings.
It does not depend on any consumer application.

- Design: [docs/kien-truc.md](docs/kien-truc.md)
- Public contract: [openapi/openapi.yaml](openapi/openapi.yaml) (OpenAPI 3.1)

## Status

Step S1 (scaffold). Only `GET /health` and `GET /ready` exist. `/ready` answers 503 until a
catalog is loaded (steps S2 to S5). No catalog data is included or invented.

## Develop

```bash
cp .env.example .env
npm ci
npm run start:dev      # http://localhost:3000/health
npm run lint && npm run typecheck && npm test && npm run build && npm run lint:openapi
docker compose up -d db   # PostgreSQL 16, used from step S2
```

Configuration is read and validated in `src/config/env.ts`; the service refuses to start on
invalid values. Errors are returned as `application/problem+json`.
