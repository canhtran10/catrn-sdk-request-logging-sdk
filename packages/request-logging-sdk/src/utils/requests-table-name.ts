/**
 * Sanitizes a table-prefix segment (letters, digits, underscore; must start with a letter).
 * @param prefix - Raw prefix from config / env
 * @returns Sanitized prefix or empty string if invalid / empty
 */
export function sanitizeTablePrefix(prefix: string | undefined): string {
  if (!prefix || typeof prefix !== 'string') return '';
  const trimmed = prefix.trim();
  if (!trimmed) return '';
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(trimmed)) return '';
  return trimmed;
}

/**
 * Physical table name for request logs: `{prefix}_requests`, or `requests` when prefix is empty.
 * @param tablePrefix - Sanitized or raw prefix (see {@link sanitizeTablePrefix})
 */
export function getRequestsTableName(tablePrefix: string | undefined): string {
  const p = sanitizeTablePrefix(tablePrefix);
  if (!p) return 'requests';
  return `${p}_requests`;
}

/**
 * Index name for {@link getRequestsTableName} (unique per schema in PostgreSQL).
 * @param tablePrefix - Same as {@link getRequestsTableName}
 */
export function getRequestsIndexName(tablePrefix: string | undefined): string {
  return `idx_${getRequestsTableName(tablePrefix)}_project_time`;
}

/**
 * Secondary index name for user_id + time filters (see {@link getRequestsTableDdl}).
 * @param tablePrefix - Same as {@link getRequestsTableName}
 */
export function getRequestsUserIndexName(tablePrefix: string | undefined): string {
  return `idx_${getRequestsTableName(tablePrefix)}_project_user_time`;
}

export function getRequestsEventTypeIndexName(
  tablePrefix: string | undefined,
): string {
  return `idx_${getRequestsTableName(tablePrefix)}_project_event_time`;
}

/**
 * DDL for the requests log table and its index (for migrations / tooling).
 * @param tablePrefix - Optional prefix; same rules as {@link getRequestsTableName}
 * @returns SQL string (semicolon-terminated statements)
 */
export function getRequestsTableDdl(tablePrefix: string | undefined): string {
  const table = getRequestsTableName(tablePrefix);
  const index = getRequestsIndexName(tablePrefix);
  const userIdx = getRequestsUserIndexName(tablePrefix);
  return `
CREATE TABLE IF NOT EXISTS ${table} (
  id UUID PRIMARY KEY,
  request_action_id UUID NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NULL,
  customer_id TEXT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INT,
  duration_ms INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL DEFAULT 'http_inbound',
  channel TEXT NULL,
  provider TEXT NULL,
  db_system TEXT NULL,
  operation TEXT NULL,
  target TEXT NULL,
  meta JSONB NULL,
  request_blob_url TEXT NULL,
  response_blob_url TEXT NULL
);

CREATE INDEX IF NOT EXISTS ${index}
  ON ${table} (project_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS ${userIdx}
  ON ${table} (project_id, user_id, timestamp DESC);
`.trim();
}
