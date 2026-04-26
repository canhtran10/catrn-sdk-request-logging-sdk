import { StorageSharedKeyCredential } from '@azure/storage-blob';

/**
 * @param connectionString - Raw value from env or config (may include wrapping quotes)
 * @returns Normalized string safe for Azure SDK and regex parsers
 */
export function normalizeStorageConnectionString(connectionString: string): string {
  let t = connectionString.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}

/**
 * @param connectionString - Azure Storage connection string (must include AccountName + AccountKey)
 * @returns Shared key credential or null (e.g. SAS-only or RBAC-only connection strings)
 */
export function getStorageSharedKeyCredential(
  connectionString: string,
): StorageSharedKeyCredential | null {
  const cs = normalizeStorageConnectionString(connectionString);
  const name = cs.match(/AccountName=([^;]+)/i)?.[1]?.trim();
  const key = cs.match(/AccountKey=([^;]+)/i)?.[1]?.trim();
  if (!name || !key) return null;
  return new StorageSharedKeyCredential(name, key);
}
