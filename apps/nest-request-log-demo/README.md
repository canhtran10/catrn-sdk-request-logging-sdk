# nest-request-log-demo

Small **NestJS** app to exercise [`@catrn-sdk/request-logging-sdk`](../../packages/request-logging-sdk) on the underlying **Express** adapter.

## What it does

- **`await initSDK(...)`** before Nest boot (env-driven). The SDK creates the **`requests`** table (or **`{prefix}_requests`**) unless **`REQUEST_LOG_AUTO_MIGRATE=false`**.
- If init fails (missing DB URL, migration error, etc.), the process **exits** so you are not left with a half-working app.
- Disables Nest’s default body parser and applies **`express.json()`**, then **`captureMiddleware()`**, so request bodies can be logged in order.
- Mounts **`createActivityLogsRouter()`** at **`/request-logs`** only when **`REQUEST_LOG_ACTIVITY_UI_ENABLED=true`**.

## Prereqs

- Node 18+
- PostgreSQL reachable by **`PG_CONNECTION`** / **`DATABASE_URL`** or by the **`POSTGRES_*`** split variables below.

### Request log table

With default settings, **`initSDK`** applies the schema (see the SDK README). You do **not** need to run `psql` first unless you set **`REQUEST_LOG_AUTO_MIGRATE=false`** and manage DDL yourself. Reference SQL still lives in **`packages/request-logging-sdk/sql/`**.

### Azure Database for PostgreSQL (SSL + root cert)

Put your `.pem` next to the app working directory (or use an absolute `POSTGRES_CERT_PATH`). The demo builds a URI like:

`postgresql://USER:PASS@HOST:5432/DB?sslmode=require&sslrootcert=/absolute/path/to.pem`

Passwords with special characters (e.g. `&`) are handled via URL encoding when using **`POSTGRES_PASSWORD`**.

**`psql`** (avoid pasting the password on the command line; use `PGPASSWORD`):

```bash
export PGPASSWORD='your_password'
psql "host=your-server.postgres.database.azure.com port=5432 dbname=your_database user=your_user sslmode=require sslrootcert=$(pwd)/MicrosoftRSARootCertificateAuthority.crt.pem"
```

PowerShell:

```powershell
$env:PGPASSWORD = 'your_password'
psql "host=your-server.postgres.database.azure.com port=5432 dbname=your_database user=your_user sslmode=require sslrootcert=$((Resolve-Path .\MicrosoftRSARootCertificateAuthority.crt.pem).Path)"
```

Do not commit real passwords or production hosts into the repo; keep them in a local **`.env`** only.

## Link to local SDK

`package.json` pins the SDK with **`file:../../packages/request-logging-sdk`**, so **`npm install` from the repo root** installs the local folder (symlink / copy), not the npm registry.

On **npm 9.2+** you can alternatively use `"workspace:*"` instead of `file:...` for the same effect inside a workspace.

After changing SDK TypeScript, rebuild the SDK then the demo: `npm run build:demo:nest`.

## Setup

The demo loads **`.env` from `apps/nest-request-log-demo/.env`** (next to `src/`), not from the monorepo root, so `npm run start -w nest-request-log-demo` works from any directory.

```bash
# from repo root
cp apps/nest-request-log-demo/.env.example apps/nest-request-log-demo/.env
# edit .env — set PG_CONNECTION or POSTGRES_*; local Postgres uses sslmode=disable unless you override
# UI credentials if REQUEST_LOG_ACTIVITY_UI_ENABLED=true
npm install
npm run build -w @catrn-sdk/request-logging-sdk
npm run build -w nest-request-log-demo
npm run start -w nest-request-log-demo
```

## Try it

- `GET http://localhost:3000/` — health JSON (should create a `requests` row).
- `GET http://localhost:3000/hello`
- `POST http://localhost:3000/echo` with JSON body `{ "a": 1 }`
- Open **`http://localhost:3000/request-logs`** — sign in if UI auth is configured, then browse captured requests.

If `initSDK` fails (missing DB URL, migration error, etc.), the demo **exits**; check `[request-logging-sdk]` lines in the console.

**Postgres SSL (discrete `POSTGRES_*` vars):** unset `POSTGRES_SSLMODE` → `sslmode=disable` for `localhost` / `127.0.0.1` / `::1`, and `require` for other hosts (e.g. Azure). Use `POSTGRES_SSLMODE=false` or `off` to force no SSL; use `require` / `verify-full` for managed cloud. **`PG_CONNECTION` / `DATABASE_URL`:** put the full URI (with the right `sslmode`) yourself — no merging with `POSTGRES_SSLMODE`.

**pg SSL warning:** optional — set `POSTGRES_SSL_LIBPQ_COMPAT=true` in `.env` (demo adds `uselibpqcompat=true` to the built URI) or use `POSTGRES_SSLMODE=verify-full` per the warning text.

**Redis:** the demo does not pass `redis.url` into `initSDK`; set **`REDIS_URL`** or **`REDIS_HOST`** / **`REDIS_PORT`** / **`REDIS_PASSWORD`** / **`REDIS_TLS`** in `.env` (see [SDK README](../../packages/request-logging-sdk/README.md)). `REDIS_TTL` is ignored by the SDK queue.

**Azure Blob:** set **`AZURE_BLOB_ENABLED=true`**, **`BLOB_CONTAINER`**, and **`AZURE_BLOB_CONNECTION_STRING`** (optional alias **`AZURE_S3_CONNECTION`**) — same `DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net` value.
