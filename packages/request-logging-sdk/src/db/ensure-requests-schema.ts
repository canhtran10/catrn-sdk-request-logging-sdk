import type { Pool } from 'pg';
import {
  getRequestsTableDdl,
  getRequestsEventTypeIndexName,
  getRequestsTableName,
} from '../utils/requests-table-name';

/**
 * Splits DDL from {@link getRequestsTableDdl} into executable statements (no `;` inside literals).
 */
function splitSqlStatements(ddl: string): string[] {
  return ddl
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Creates the requests log table and indexes if missing, and adds legacy columns when needed.
 * **`initSDK`** runs this when **`postgres.autoMigrate`** is true (the default). Idempotent.
 *
 * @param pool - PostgreSQL pool
 * @param tablePrefix - Same as SDK `postgres.tablePrefix` (sanitized upstream)
 */
export async function ensureRequestsSchema(
  pool: Pool,
  tablePrefix: string | undefined,
): Promise<void> {
  const ddl = getRequestsTableDdl(tablePrefix);
  for (const stmt of splitSqlStatements(ddl)) {
    await pool.query(stmt);
  }
  const table = getRequestsTableName(tablePrefix);
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS user_id TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS customer_id TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS request_action_id UUID NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'http_inbound'`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS channel TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS provider TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS db_system TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS operation TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS target TEXT NULL`,
  );
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS meta JSONB NULL`);
  const eventIdx = getRequestsEventTypeIndexName(tablePrefix);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS ${eventIdx} ON ${table} (project_id, event_type, timestamp DESC)`,
  );
}
