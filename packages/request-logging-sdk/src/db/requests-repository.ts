import type { Pool } from 'pg';
import type { CaptureJob } from '../types/capture-job';
import type { ActivityListFilters } from './activity-list-filters';

const ROW_SELECT = `id, request_action_id, project_id, user_id, customer_id, method, url, status_code, duration_ms, timestamp,
              event_type, channel, provider, db_system, operation, target, meta,
              request_blob_url, response_blob_url`;

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
        (id, request_action_id, project_id, user_id, customer_id, method, url, status_code, duration_ms, timestamp,
         event_type, channel, provider, db_system, operation, target, meta)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz,
               $11, $12, $13, $14, $15, $16, $17::jsonb)`,
      [
        job.requestId,
        job.requestActionId ?? null,
        job.projectId,
        job.userId ?? null,
        job.customerId ?? null,
        job.method,
        job.url,
        job.statusCode,
        Math.round(job.durationMs),
        job.timestamp,
        job.eventType || 'http_inbound',
        job.channel ?? null,
        job.provider ?? null,
        job.dbSystem ?? null,
        job.operation ?? null,
        job.target ?? null,
        job.meta ? JSON.stringify(job.meta) : null,
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
      `SELECT ${ROW_SELECT}
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
    const cond: string[] = ['project_id = $1', `event_type = 'http_inbound'`];
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
    if (f.eventType !== undefined && f.eventType !== '') {
      cond.push(`event_type = $${i}`);
      params.push(f.eventType);
      i++;
    }
    if (f.channel !== undefined && f.channel !== '') {
      cond.push(`channel = $${i}`);
      params.push(f.channel);
      i++;
    }
    if (f.provider !== undefined && f.provider !== '') {
      cond.push(`provider = $${i}`);
      params.push(f.provider);
      i++;
    }
    if (f.dbSystem !== undefined && f.dbSystem !== '') {
      cond.push(`db_system = $${i}`);
      params.push(f.dbSystem);
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
      `SELECT ${ROW_SELECT}
       FROM ${this.requestsTable}
       WHERE ${where}
       ORDER BY timestamp ${orderSql}
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      params,
    );

    return { total, rows: dataR.rows as Record<string, unknown>[] };
  }

  async listRelatedForRequestAction(
    projectId: string,
    requestActionId: string,
  ): Promise<Record<string, unknown>[]> {
    const r = await this.pool.query(
      `SELECT ${ROW_SELECT}
       FROM ${this.requestsTable}
       WHERE project_id = $1
         AND request_action_id = $2::uuid
         AND event_type <> 'http_inbound'
       ORDER BY timestamp ASC`,
      [projectId, requestActionId],
    );
    return r.rows as Record<string, unknown>[];
  }
}
