import { BlobServiceClient } from '@azure/storage-blob';
import { Readable } from 'node:stream';
import type { CaptureJob } from '../types/capture-job';
import { normalizeStorageConnectionString } from './connection-string';

/** Chunk size (bytes) passed to {@link BlockBlobClient.uploadStream} */
const UPLOAD_STREAM_BUFFER_SIZE = 4 * 1024 * 1024;
/** Parallel block uploads for {@link BlockBlobClient.uploadStream} */
const UPLOAD_STREAM_MAX_CONCURRENCY = 5;

const BLOB_BUCKET_MINUTES = 1;

/**
 * @param date - UTC instant
 * @returns `HHmm` folder name for the {@link BLOB_BUCKET_MINUTES}-minute UTC window that contains `date` (start inclusive)
 */
export function utcTimeBucketLabel(date: Date): string {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const bucketStart = Math.floor(minutes / BLOB_BUCKET_MINUTES) * BLOB_BUCKET_MINUTES;
  const h = Math.floor(bucketStart / 60);
  const m = bucketStart % 60;
  return String(h).padStart(2, '0') + String(m).padStart(2, '0');
}

/**
 * @param date - Timestamp for path folders (UTC calendar + 1-minute bucket)
 * @param projectId - Project segment
 * @param requestId - Request UUID
 * @param kind - request or response filename suffix
 * @returns Blob path *inside* container (no leading slash), e.g. `proj/2026/04/24/1423/{uuid}-request.json`
 * @deprecated Prefer {@link buildAppendBlobPath} + append logs; kept for callers that still reference per-request paths
 */
export function buildBlobPath(
  date: Date,
  projectId: string,
  requestId: string,
  kind: 'request' | 'response',
): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const bucket = utcTimeBucketLabel(date);
  return `${projectId}/${y}/${mo}/${d}/${bucket}/${requestId}-${kind}.json`;
}

/**
 * @param date - Timestamp for path folders (UTC calendar + 1-minute bucket)
 * @param projectId - Project segment
 * @param kind - Which shared append file (`requests.jsonl` holds request headers/body; `responses.jsonl` response body)
 * @returns Append blob path inside container, e.g. `proj/2026/04/24/1423/requests.jsonl`
 */
export function buildAppendBlobPath(
  date: Date,
  projectId: string,
  kind: 'request' | 'response',
): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const bucket = utcTimeBucketLabel(date);
  const file = kind === 'request' ? 'requests.jsonl' : 'responses.jsonl';
  return `${projectId}/${y}/${mo}/${d}/${bucket}/${file}`;
}

/**
 * @param connectionString - Azure storage connection string
 * @param containerName - Container name
 */
export class AzureBlobWriter {
  private readonly container: ReturnType<
    BlobServiceClient['getContainerClient']
  >;

  constructor(connectionString: string, containerName: string) {
    const cs = normalizeStorageConnectionString(connectionString);
    const svc = BlobServiceClient.fromConnectionString(cs);
    this.container = svc.getContainerClient(containerName.trim());
  }

  /**
   * @param blobPath - Append blob path (typically `…/requests.jsonl` or `…/responses.jsonl`)
   * @param record - One JSON object per line; must stay within append block size limits (4 MiB per line on Azure)
   * @returns Public append blob URL (no SAS); same path for all rows in that 1-minute bucket
   */
  async appendJsonlLine(blobPath: string, record: unknown): Promise<string> {
    await this.container.createIfNotExists();
    const line = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const maxAppend = 4 * 1024 * 1024;
    if (line.length > maxAppend) {
      throw new Error(`append_line_exceeds_limit: ${line.length} bytes (max ${maxAppend})`);
    }
    const appendClient = this.container.getAppendBlobClient(blobPath);
    await appendClient.createIfNotExists({
      blobHTTPHeaders: {
        blobContentType: 'application/x-ndjson; charset=utf-8',
      },
    });
    await appendClient.appendBlock(line, line.length);
    return appendClient.url;
  }

  /**
   * @param blobPath - Block blob path inside container
   * @param jsonBody - Serializable object
   * @returns Public blob URL (no SAS)
   */
  async uploadJson(blobPath: string, jsonBody: unknown): Promise<string> {
    await this.container.createIfNotExists();
    const body = Buffer.from(JSON.stringify(jsonBody), 'utf8');
    const stream = Readable.from(body);
    const block = this.container.getBlockBlobClient(blobPath);
    await block.uploadStream(
      stream,
      UPLOAD_STREAM_BUFFER_SIZE,
      UPLOAD_STREAM_MAX_CONCURRENCY,
      {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      },
    );
    return block.url;
  }

  /**
   * @param job - Capture job
   * @param projectId - Project id segment
   */
  async uploadRequestAndResponse(
    job: CaptureJob,
    projectId: string,
  ): Promise<{ requestUrl: string | null; responseUrl: string | null }> {
    const ts = new Date(job.timestamp);
    let requestUrl: string | null = null;
    let responseUrl: string | null = null;
    const reqPath = buildAppendBlobPath(ts, projectId, 'request');
    const resPath = buildAppendBlobPath(ts, projectId, 'response');
    try {
      requestUrl = await this.appendJsonlLine(reqPath, {
        requestId: job.requestId,
        headers: job.requestHeaders,
        body: job.requestBody,
      });
    } catch (e) {
      console.error('[request-logging-sdk] blob append (request) failed', e);
      requestUrl = null;
    }
    try {
      responseUrl = await this.appendJsonlLine(resPath, {
        requestId: job.requestId,
        body: job.responseBody,
      });
    } catch (e) {
      console.error('[request-logging-sdk] blob append (response) failed', e);
      responseUrl = null;
    }
    return { requestUrl, responseUrl };
  }
}
