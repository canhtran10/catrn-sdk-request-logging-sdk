-- =============================================================================
-- One-shot migration: add user_id + customer_id + index for activity UI filters.
-- Edit target_table below (e.g. 'requests' or 'myapp_requests'), then run:
--   psql "$PG_CONNECTION" -f packages/request-logging-sdk/sql/002_user_customer.sql
-- =============================================================================

DO $migration$
DECLARE
  target_table text := 'requests'; -- << change if you use postgres.tablePrefix → {prefix}_requests
  idx_name text;
BEGIN
  idx_name := 'idx_' || target_table || '_project_user_time';

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id TEXT NULL',
    target_table
  );
  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS customer_id TEXT NULL',
    target_table
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (project_id, user_id, timestamp DESC)',
    idx_name,
    target_table
  );
END
$migration$;
