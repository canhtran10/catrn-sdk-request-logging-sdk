import type { Pool } from 'pg';
import type { SdkConfig } from '../types/sdk-config';
import type { CaptureJob } from '../types/capture-job';
import { RequestsRepository } from '../db/requests-repository';
import { getRequestsTableName } from '../utils/requests-table-name';
import { AzureBlobWriter } from '../blob/azure-blob';

/**
 * @param config - Resolved SDK config
 * @param pool - pg pool (already connected)
 * @param logError - Throttled error sink
 */
export class JobProcessor {
  private readonly repo: RequestsRepository;
  private blob: AzureBlobWriter | null = null;

  constructor(
    private readonly config: SdkConfig,
    pool: Pool,
    private readonly logError: (msg: string, err?: unknown) => void,
  ) {
    this.repo = new RequestsRepository(
      pool,
      getRequestsTableName(config.postgres.tablePrefix),
    );
    if (config.azureBlob.enabled) {
      try {
        this.blob = new AzureBlobWriter(
          config.azureBlob.connectionString,
          config.azureBlob.containerName,
        );
      } catch (e) {
        this.logError('AzureBlobWriter init failed', e);
        this.blob = null;
      }
    }
  }

  /**
   * @param job - One capture job
   */
  async process(job: CaptureJob): Promise<void> {
    const max = this.config.dbMaxRetries;
    let lastErr: unknown;
    for (let attempt = 0; attempt < max; attempt++) {
      try {
        await this.repo.insertRequest(job);
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    if (lastErr) {
      this.logError('insertRequest failed after retries', lastErr);
      return;
    }

    if (!this.config.azureBlob.enabled || !this.blob) {
      return;
    }

    try {
      const { requestUrl, responseUrl } = await this.blob.uploadRequestAndResponse(
        job,
        this.config.projectId,
      );
      await this.repo.updateBlobUrls(job.requestId, requestUrl, responseUrl);
    } catch (e) {
      this.logError('blob upload or URL update failed (row still persisted)', e);
    }
  }
}
