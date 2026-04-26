-- Reference DDL for the request log table (default name `requests`).
-- With default settings, **`await initSDK(...)`** applies the same schema automatically
-- (`ensureRequestsSchema`); you normally do not need to run this file by hand.
-- With `postgres.tablePrefix` / `REQUEST_LOG_TABLE_PREFIX` (e.g. `myapp`), the physical table is
-- `myapp_requests` — use `getRequestsTableDdl(prefix)` or copy this file and rename `requests` / indexes.

CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NULL,
  customer_id TEXT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INT,
  duration_ms INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_blob_url TEXT NULL,
  response_blob_url TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_project_time
  ON requests (project_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_requests_project_user_time
  ON requests (project_id, user_id, timestamp DESC);
