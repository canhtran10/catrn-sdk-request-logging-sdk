import type { Pool } from 'pg';
import type { CaptureJob } from '../types/capture-job';
import type { ActivityListFilters } from './activity-list-filters';

/**
 * @param pool - Shared pg pool
 * @param requestsTable - Physical table name (e.g. `requests` or `myapp_requests`)
 */
export class RequestsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly requestsTable: string,
  ) {}

  /**
   * @param job - Capture payload
   */
  async insertRequest(job: CaptureJob): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.requestsTable}
        (id, project_id, user_id, customer_id, method, url, status_code, duration_ms, timestamp)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
      [
        job.requestId,
        job.projectId,
        job.userId ?? null,
        job.customerId ?? null,
        job.method,
        job.url,
        job.statusCode,
        Math.round(job.durationMs),
        job.timestamp,
      ],
    );
  }

  /**
   * @param requestId - Primary key
   * @param requestUrl - Full blob URL or null
   * @param responseUrl - Full blob URL or null
   */
  async updateBlobUrls(
    requestId: string,
    requestUrl: string | null,
    responseUrl: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ${this.requestsTable}
       SET request_blob_url = $2,
           response_blob_url = $3
       WHERE id = $1::uuid`,
      [requestId, requestUrl, responseUrl],
    );
  }

  /**
   * @param projectId - Tenant id
   * @param id - Row UUID
   * @returns Row or undefined
   */
  async findByIdForProject(
    projectId: string,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const r = await this.pool.query(
      `SELECT id, project_id, user_id, customer_id, method, url, status_code, duration_ms, timestamp,
              request_blob_url, response_blob_url
       FROM ${this.requestsTable}
       WHERE id = $1::uuid AND project_id = $2
       LIMIT 1`,
      [id, projectId],
    );
    return r.rows[0] as Record<string, unknown> | undefined;
  }

  /**
   * @param f - Filter + pagination
   * @returns Total matching rows and one page
   */
  async listForActivityUi(
    f: ActivityListFilters,
  ): Promise<{ total: number; rows: Record<string, unknown>[] }> {
    const cond: string[] = ['project_id = $1'];
    const params: unknown[] = [f.projectId];
    let i = 2;

    cond.push(`timestamp >= $${i}::timestamptz`);
    params.push(f.fromIso);
    i++;
    cond.push(`timestamp <= $${i}::timestamptz`);
    params.push(f.toIso);
    i++;

    if (f.userId !== undefined && f.userId !== '') {
      cond.push(`user_id = $${i}`);
      params.push(f.userId);
      i++;
    }
    if (f.customerId !== undefined && f.customerId !== '') {
      cond.push(`customer_id = $${i}`);
      params.push(f.customerId);
      i++;
    }
    if (f.method !== undefined && f.method !== '') {
      cond.push(`method = $${i}`);
      params.push(f.method.toUpperCase());
      i++;
    }
    if (f.statusCode !== undefined && Number.isFinite(f.statusCode)) {
      cond.push(`status_code = $${i}`);
      params.push(f.statusCode);
      i++;
    }

    const where = cond.join(' AND ');
    const orderSql = f.sort === 'asc' ? 'ASC' : 'DESC';

    const countR = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM ${this.requestsTable} WHERE ${where}`,
      params,
    );
    const total = parseInt(countR.rows[0]?.c || '0', 10);

    params.push(f.limit, f.offset);
    const limIdx = i;
    const offIdx = i + 1;
    const dataR = await this.pool.query(
      `SELECT id, project_id, user_id, customer_id, method, url, status_code, duration_ms, timestamp,
              request_blob_url, response_blob_url
       FROM ${this.requestsTable}
       WHERE ${where}
       ORDER BY timestamp ${orderSql}
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      params,
    );

    return { total, rows: dataR.rows as Record<string, unknown>[] };
  }
}
