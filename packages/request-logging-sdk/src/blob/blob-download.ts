import { BlobClient } from '@azure/storage-blob';
import { getStorageSharedKeyCredential } from './connection-string';

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Thrown when the blob size exceeds the configured download limit.
 */
export class BlobDownloadTooLargeError extends Error {
  readonly code = 'blob_too_large' as const;

  /**
   * @param contentLength - Blob size from {@link BlobClient.getProperties}
   * @param maxBytes - Configured download ceiling
   */
  constructor(
    readonly contentLength: number,
    readonly maxBytes: number,
  ) {
    super(`blob_too_large: ${contentLength} bytes (max ${maxBytes})`);
    this.name = 'BlobDownloadTooLargeError';
  }
}

/**
 * Downloads a block blob using the storage account key (no SAS). Uses {@link BlobClient} with the
 * canonical blob URL so path encoding matches Azure (avoids hand-parsing pathname segments).
 *
 * Note: {@link BlobClient.downloadToBuffer}'s `count` is the **exact** number of bytes to download,
 * not a cap. This helper loads size from {@link BlobClient.getProperties}, rejects blobs larger than
 * `maxBytes`, then downloads exactly `contentLength` bytes.
 *
 * @param connectionString - Azure Storage connection string (AccountName + AccountKey)
 * @param blobUrl - Public blob URL as stored after upload (SAS query string is stripped if present)
 * @param maxBytes - Refuse download if blob is larger than this (default 4 MiB)
 * @returns Raw blob bytes (typically JSON UTF-8)
 */
export async function downloadBlobBlock(
  connectionString: string,
  blobUrl: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Buffer> {
  const cred = getStorageSharedKeyCredential(connectionString);
  if (!cred) {
    throw new Error('storage_connection_string_missing_account_key');
  }
  const canonical = blobUrl.split('?')[0].trim();
  if (!/^https?:\/\//i.test(canonical)) {
    throw new Error('blob_url_invalid');
  }
  const client = new BlobClient(canonical, cred);
  const props = await client.getProperties();
  const total = props.contentLength ?? 0;
  if (total > maxBytes) {
    throw new BlobDownloadTooLargeError(total, maxBytes);
  }
  if (total === 0) {
    return Buffer.alloc(0);
  }
  return await client.downloadToBuffer(0, total);
}
