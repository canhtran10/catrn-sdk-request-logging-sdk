# @catrn-sdk/request-logging-sdk

In-process **Express** middleware that captures HTTP request/response metadata, queues work asynchronously (memory by default, **optional Redis**), persists to **PostgreSQL**, and optionally uploads JSON bodies to **Azure Blob Storage**.

This package complements the distributed Nest + Bull design in [../../README.md](../../README.md); use this SDK when you want **everything inside one Node process** with minimal integration.

**Postgres tables:** with the default settings, **`await initSDK(...)`** creates or updates the log table and indexes (`requests` or `{prefix}_requests`) before the background worker runs. The host app does not need a separate migration step for that table unless you set **`postgres.autoMigrate`** / **`REQUEST_LOG_AUTO_MIGRATE`** to `false`.

## Integration

Place **`captureMiddleware` after `express.json()`** if you need parsed `req.body` logged.

```typescript
import express from 'express';
import {
  initSDK,
  captureMiddleware,
  createActivityLogsRouter,
} from '@catrn-sdk/request-logging-sdk';

await initSDK({
  projectId: 'my-project',
  postgres: {
    connectionString: process.env.PG_CONNECTION!,
    // Optional: physical table `{prefix}_requests` vs `requests`; schema is applied inside initSDK when autoMigrate is true (default)
    tablePrefix: process.env.REQUEST_LOG_TABLE_PREFIX || '',
  },
  activityLogsUi: {
    enabled: process.env.REQUEST_LOG_ACTIVITY_UI_ENABLED === 'true',
    username: process.env.REQUEST_LOG_ACTIVITY_UI_USERNAME || '',
    password: process.env.REQUEST_LOG_ACTIVITY_UI_PASSWORD || '',
  },
  azureBlob: {
    enabled: process.env.AZURE_BLOB_ENABLED === 'true',
    connectionString:
      process.env.AZURE_BLOB_CONNECTION_STRING ||
      process.env.AZURE_S3_CONNECTION!,
    containerName: process.env.BLOB_CONTAINER!,
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL || '',
  },
  capture: {
    headers: true,
    body: true,
    maxBodySize: 65536,
  },
});

const app = express();
app.use(express.json());
app.use(captureMiddleware());

// Optional: simple HTML + JSON viewer (enable activityLogsUi; protect in production)
app.use('/request-logs', createActivityLogsRouter());
```

## Environment variables (optional overrides)

| Variable | Purpose |
|----------|---------|
| `REQUEST_LOG_PROJECT_ID` | Default `projectId` |
| `PG_CONNECTION` / `DATABASE_URL` | Postgres connection string |
| `AZURE_BLOB_ENABLED` | `true` to upload blobs |
| `AZURE_BLOB_CONNECTION_STRING` | Azure **Blob** connection string (`DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=...`) |
| `AZURE_S3_CONNECTION` | Optional **alias** for the same value (name only; still Azure Blob, not AWS S3) |
| `BLOB_CONTAINER` | Blob container name |
| `REDIS_ENABLED` | `true` to use Redis list queue |
| `REDIS_URL` | Redis connection URL (takes precedence when set) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` | If `REDIS_URL` is empty, URL is built as `redis(s)://[:password@]host:port` (`rediss://` when `REDIS_TLS=true`, e.g. Azure Cache on 6380) |
| `REDIS_TTL` | Not used by this SDK (LIST queue); reserved for your own services / future use |
| `REQUEST_LOG_CAPTURE_HEADERS` | `true`/`false` |
| `REQUEST_LOG_CAPTURE_BODY` | `true`/`false` |
| `REQUEST_LOG_MAX_BODY` | Max captured body bytes |
| `REQUEST_LOG_QUEUE_MAX` | In-memory queue cap (drop oldest) |
| `REQUEST_LOG_DB_RETRIES` | Insert retries |
| `REQUEST_LOG_ERROR_THROTTLE_MS` | Throttle identical error logs |
| `REQUEST_LOG_TABLE_PREFIX` | When set, rows go to table **`{prefix}_requests`** (e.g. prefix `myapp` → `myapp_requests`). Empty → table **`requests`**. Must match `/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/`. |
| `REQUEST_LOG_AUTO_MIGRATE` | Default **`true`**: **`initSDK`** creates/updates the log table and indexes (and adds `user_id` / `customer_id` on older tables). Set **`false`** only if your own migrations own that DDL. |
| `REQUEST_LOG_ACTIVITY_UI_ENABLED` | `true` to allow `createActivityLogsRouter()` UI + API |
| `REQUEST_LOG_ACTIVITY_UI_USERNAME` / `REQUEST_LOG_ACTIVITY_UI_PASSWORD` | If **both** are set, the UI shows a login form; credentials are checked against these values (also settable via `initSDK`). Leave both empty for an **unauthenticated** viewer (dev only). |
| `AZURE_STORAGE_ACCOUNT_KEY` | (Used by separate log-api SAS only—not this SDK) |

## Activity logs UI

When `activityLogsUi.enabled` is true, mount `createActivityLogsRouter()` on your Express app (e.g. `/request-logs`). Full API paths are **`{mount}/api/login`**, **`{mount}/api/list`**, etc. The bundled page builds URLs from `location.pathname` so **`/request-logs` without a trailing slash** still works (plain relative `api/login` would incorrectly hit `/api/login`).

It serves:

- **`GET /`** — HTML shell: optional **username / password** gate, then a paginated table.
- **`POST /api/login`** — JSON body `{ "username", "password" }`; returns `{ ok, session }` when they match `activityLogsUi` (constant-time compare).
- **`POST /api/logout`** — invalidates the server session when sent with `Authorization: Bearer <session>`.
- **`GET /api/list?page=1`** — JSON `{ page, pageSize, total, rows }` for the current `projectId` (requires a valid session when UI auth is configured).

**Session behaviour:** after login, the browser stores the session id in **`sessionStorage`** and sends `Authorization: Bearer <session>` to the API. **`sessionStorage` is cleared when the user closes the tab or window**, so the next visit shows the login form again. Server sessions expire after **8 hours** and are cleared on **`shutdownSDK()`**.

If **username and password are both empty**, the list loads without a login (suitable only for trusted local use). In production, set credentials and/or protect the route with a reverse proxy.

## Database

The physical table is **`requests`** by default, or **`{tablePrefix}_requests`** when `postgres.tablePrefix` / `REQUEST_LOG_TABLE_PREFIX` is set (e.g. `acme` → `acme_requests`).

**Schema ownership (default):** the package applies DDL **inside `await initSDK(...)`** before starting the worker: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `user_id` / `customer_id` when needed. That is controlled by **`postgres.autoMigrate`** (default **`true`**; disable with **`REQUEST_LOG_AUTO_MIGRATE=false`** or **`initSDK({ postgres: { autoMigrate: false } })`** when you manage this table yourself).

**Reference only** (not required when auto-migrate is on): [sql/001_requests.sql](sql/001_requests.sql) mirrors what `initSDK` applies; **`getRequestsTableDdl`** / **`ensureRequestsSchema`** are exported for tooling or custom setups.

If `initSDK` is skipped, misconfigured, or migration fails and is not retried, inserts fail after retries.

## Azure Blob layout

Inside the container:

```
{projectId}/yyyy/mm/dd/{requestId}-request.json
{projectId}/yyyy/mm/dd/{requestId}-response.json
```

Public blob URLs (no SAS) are stored in `requests.request_blob_url` / `response_blob_url`.

## Behaviour guarantees

- Middleware **never awaits** database or blob I/O; it only **enqueues** a job.
- **try/catch** around middleware and processor paths; failures are logged, host requests continue.
- **Redis LPUSH** failures fall back to the **in-memory** queue for that job.
- **Queue full** (memory): **drop oldest** then push.
- **Blob upload** failure: DB row still inserted; URLs may stay null.
- **`shutdownSDK()`** for tests or graceful shutdown.

## Nest vs Express

- **Distributed Nest + worker:** implement Bull enqueue + separate worker per [docs/observability-platform-sa-plan.md](../../docs/observability-platform-sa-plan.md).
- **Express in-process:** this package.
