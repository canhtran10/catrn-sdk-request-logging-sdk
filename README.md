# Logs — observability platform (code)

Monorepo aligned with [docs/observability-platform-sa-plan.md](docs/observability-platform-sa-plan.md).

## Packages

| Path | Role |
|------|------|
| `packages/request-logging-sdk` | **Express** in-process SDK: optional Redis queue, PostgreSQL `requests`, optional Azure Blob (`initSDK` + `captureMiddleware`) — [README](packages/request-logging-sdk/README.md) |
| `apps/nest-request-log-demo` | **NestJS** sample host (Express adapter + SDK + `/request-logs` UI) — [README](apps/nest-request-log-demo/README.md) |
Distributed **worker / log-api** apps (when present in repo) are described in [docs/observability-platform-sa-plan.md](docs/observability-platform-sa-plan.md).

## Prerequisites

- Node 18+
- **Express / in-process path:** PostgreSQL + [packages/request-logging-sdk/sql/001_requests.sql](packages/request-logging-sdk/sql/001_requests.sql), optional Redis, optional Azure Blob per [packages/request-logging-sdk/README.md](packages/request-logging-sdk/README.md).
- **Distributed design** (Nest + separate worker + log UI) remains described in [docs/observability-platform-sa-plan.md](docs/observability-platform-sa-plan.md) as architecture guidance; implement in your own services if needed.

## Build

```bash
npm install
npm run build
```

## Run

**Express host:** `initSDK` + `captureMiddleware` — [packages/request-logging-sdk/README.md](packages/request-logging-sdk/README.md).

**Nest demo:** `npm run build:demo:nest` then `npm run demo:nest` (see [apps/nest-request-log-demo/README.md](apps/nest-request-log-demo/README.md)).
