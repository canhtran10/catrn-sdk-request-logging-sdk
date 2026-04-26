import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
} from '@azure/storage-blob';
import { getStorageSharedKeyCredential } from './connection-string';

/**
 * Decode pathname safely for segment splitting.
 * @param pathname - URL.pathname
 * @returns Decoded path or original on invalid escape sequences
 */
function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * @param blobUrl - Full blob URL returned from upload (no SAS)
 * @param expectedContainer - Container name from SDK config (case-insensitive)
 * @returns Blob path inside container or null if URL does not match container
 */
export function parseBlobPathFromUrl(
  blobUrl: string,
  expectedContainer: string,
): { blobName: string } | null {
  try {
    const u = new URL(blobUrl);
    const raw = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    const path = decodePath(raw);
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const exp = expectedContainer.trim().toLowerCase();

    let containerIdx = 0;
    if (
      segments[0].toLowerCase() === 'devstoreaccount1' &&
      segments.length >= 3
    ) {
      containerIdx = 1;
    }

    const container = segments[containerIdx];
    if (!container || container.toLowerCase() !== exp) return null;
    const blobName = segments.slice(containerIdx + 1).join('/');
    if (!blobName) return null;
    return { blobName };
  } catch {
    return null;
  }
}

/**
 * @param blobUrl - Stored blob URL (HTTPS or emulator HTTP)
 * @param connectionString - Storage connection string
 * @param containerName - Expected container
 * @param ttlMinutes - SAS lifetime (default 15)
 * @returns URL with read SAS query string, or null
 */
export function generateBlobReadSasUrl(
  blobUrl: string,
  connectionString: string,
  containerName: string,
  ttlMinutes = 15,
): string | null {
  const parsed = parseBlobPathFromUrl(blobUrl, containerName);
  const cred = getStorageSharedKeyCredential(connectionString);
  if (!parsed || !cred) return null;
  const startsOn = new Date(Date.now() - 60 * 1000);
  const expiresOn = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const protocol = blobUrl.startsWith('https://')
    ? SASProtocol.Https
    : SASProtocol.HttpsAndHttp;
  const sas = generateBlobSASQueryParameters(
    {
      containerName: containerName.trim(),
      blobName: parsed.blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol,
    },
    cred,
  ).toString();
  const sep = blobUrl.includes('?') ? '&' : '?';
  return `${blobUrl}${sep}${sas}`;
}
