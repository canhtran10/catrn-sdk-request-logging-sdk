import type { Request, Response, IRouter } from 'express';
import express, { Router } from 'express';
import { getSdkPostgresContext, getSdkConfig } from '../core/init-sdk';
import {
  issueActivityUiSession,
  validateActivityUiSession,
  destroyActivityUiSession,
} from './activity-ui-sessions';
import { secureStringEqual } from '../utils/secure-string-compare';
import { RequestsRepository } from '../db/requests-repository';
import type { ActivityListFilters } from '../db/activity-list-filters';
import { RestError } from '@azure/storage-blob';
import { generateBlobReadSasUrl } from '../blob/blob-read-sas';
import {
  extractJsonlEntryForRequestId,
  isAppendLogBlobUrl,
} from '../blob/append-log-jsonl';
import { BlobDownloadTooLargeError, downloadBlobBlock } from '../blob/blob-download';
import { activityLogsHtmlPage } from './activity-logs-html';

export interface ActivityLogsRouterOptions {
  /** Max rows per page (default 50, cap 200) */
  pageSize?: number;
}

type ActivityCtx = NonNullable<ReturnType<typeof getSdkPostgresContext>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_RANGE_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Express router: HTML activity log viewer + JSON API.
 * Mount after {@link initSDK}, e.g. `app.use('/request-logs', createActivityLogsRouter())`.
 * Enable via `activityLogsUi.enabled`. Optional `activityLogsUi.username` + `password`
 * require a browser login; session id is kept in sessionStorage (cleared when the tab closes).
 * @param options - Pagination defaults
 * @returns Express Router
 */
export function createActivityLogsRouter(
  options?: ActivityLogsRouterOptions,
): IRouter {
  const defaultPageSize = Math.min(200, Math.max(1, options?.pageSize ?? 50));
  const r = Router();

  /**
   * @param res - Express response
   * @returns Context or null after sending error response
   */
  function assertUiAvailable(res: Response): ActivityCtx | null {
    const ctx = getSdkPostgresContext();
    if (!ctx) {
      res.status(503).type('text').send(
        [
          'Request logging SDK has no active Postgres context.',
          'initSDK() was not called, did not finish (await it), or failed (invalid config, migration error, or DB unreachable — check server logs).',
        ].join('\n'),
      );
      return null;
    }
    if (!ctx.activityLogsUiEnabled) {
      res.status(404).send('Activity logs UI is disabled.');
      return null;
    }
    return ctx;
  }

  /**
   * @param req - Incoming request
   * @param res - Express response
   * @param ctx - Activity context
   * @returns True if caller may continue
   */
  function assertUiSession(
    req: Request,
    res: Response,
    ctx: ActivityCtx,
  ): boolean {
    if (!ctx.activityLogsUiAuthRequired) return true;
    const token = readBearerToken(req);
    if (!validateActivityUiSession(token)) {
      res.status(401).json({ error: 'login_required' });
      return false;
    }
    return true;
  }

  /**
   * @param req - Express request
   * @returns Bearer token or undefined
   */
  function readBearerToken(req: Request): string | undefined {
    const h = req.headers.authorization;
    if (!h || !h.toLowerCase().startsWith('bearer ')) return undefined;
    const t = h.slice(7).trim();
    return t || undefined;
  }

  /**
   * @param req - List query
   * @param pageSize - Max page size
   * @returns Filters or error payload
   */
  function parseListFilters(
    req: Request,
    pageSize: number,
  ):
    | { ok: true; filters: ActivityListFilters }
    | { ok: false; status: number; body: Record<string, string> } {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.pageSize || pageSize), 10) || pageSize),
    );
    const offset = (page - 1) * limit;

    const fromIso = String(req.query.from || '').trim();
    const toIso = String(req.query.to || '').trim();
    if (!fromIso || !toIso) {
      return {
        ok: false,
        status: 400,
        body: { error: 'from_and_to_required' },
      };
    }
    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return { ok: false, status: 400, body: { error: 'invalid_dates' } };
    }
    if (fromMs > toMs) {
      return { ok: false, status: 400, body: { error: 'from_after_to' } };
    }
    if (toMs - fromMs > MAX_RANGE_MS) {
      return {
        ok: false,
        status: 400,
        body: { error: 'range_exceeds_15_days' },
      };
    }

    const sort = String(req.query.sort || 'asc') === 'desc' ? 'desc' : 'asc';
    const userId = String(req.query.userId || '').trim() || undefined;
    const customerId = String(req.query.customerId || '').trim() || undefined;
    const method = String(req.query.method || '').trim().toUpperCase() || undefined;
    const scRaw = String(req.query.statusCode || '').trim();
    let statusCode: number | undefined;
    if (scRaw !== '') {
      const n = parseInt(scRaw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 599) {
        return { ok: false, status: 400, body: { error: 'bad_status_code' } };
      }
      statusCode = n;
    }

    return {
      ok: true,
      filters: {
        projectId: '', // filled by caller
        fromIso,
        toIso,
        userId,
        customerId,
        method,
        statusCode,
        sort,
        limit,
        offset,
      },
    };
  }

  r.post(
    '/api/login',
    express.json({ limit: '16kb' }),
    (req: Request, res: Response) => {
      const ctx = assertUiAvailable(res);
      if (!ctx) return;
      if (!ctx.activityLogsUiAuthRequired) {
        res.status(400).json({ error: 'auth_not_configured' });
        return;
      }
      const body = req.body as { username?: string; password?: string };
      const u = typeof body.username === 'string' ? body.username : '';
      const p = typeof body.password === 'string' ? body.password : '';
      const okUser = secureStringEqual(
        ctx.activityLogsUiUsername.trim(),
        u.trim(),
      );
      const okPass = secureStringEqual(
        ctx.activityLogsUiPassword.trim(),
        p.trim(),
      );
      if (!okUser || !okPass) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      const session = issueActivityUiSession();
      res.json({ ok: true, session });
    },
  );

  r.post('/api/logout', (req: Request, res: Response) => {
    const ctx = assertUiAvailable(res);
    if (!ctx) return;
    destroyActivityUiSession(readBearerToken(req));
    res.json({ ok: true });
  });

  r.get('/api/list', async (req: Request, res: Response) => {
    const ctx = assertUiAvailable(res);
    if (!ctx) return;
    if (!assertUiSession(req, res, ctx)) return;

    const parsed = parseListFilters(req, defaultPageSize);
    if (!parsed.ok) {
      res.status(parsed.status).json(parsed.body);
      return;
    }
    const filters = parsed.filters;
    filters.projectId = ctx.projectId;

    const repo = new RequestsRepository(ctx.pool, ctx.requestsTable);
    try {
      const { total, rows } = await repo.listForActivityUi(filters);
      const page =
        Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1) || 1;
      res.json({
        page,
        pageSize: filters.limit,
        total,
        rows,
      });
    } catch (e) {
      console.error('[request-logging-sdk] activity list failed', e);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  /**
   * Same-origin blob body download (avoids browser CORS to *.blob.core.windows.net).
   * @param req.params.id - Request log row UUID
   * @param req.query.kind - `request` | `response`
   */
  r.get('/api/request/:id/blob', async (req: Request, res: Response) => {
    const ctx = assertUiAvailable(res);
    if (!ctx) return;
    if (!assertUiSession(req, res, ctx)) return;
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'bad_id' });
      return;
    }
    const kind = String(req.query.kind || 'request').toLowerCase();
    if (kind !== 'request' && kind !== 'response') {
      res.status(400).json({ error: 'bad_kind' });
      return;
    }
    const cfg = getSdkConfig();
    if (
      !cfg?.azureBlob.enabled ||
      !cfg.azureBlob.connectionString ||
      !cfg.azureBlob.containerName
    ) {
      res.status(503).json({ error: 'blob_disabled' });
      return;
    }
    const repo = new RequestsRepository(ctx.pool, ctx.requestsTable);
    try {
      const row = await repo.findByIdForProject(ctx.projectId, id);
      if (!row) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const blobUrl =
        kind === 'request'
          ? (row.request_blob_url as string | null | undefined)
          : (row.response_blob_url as string | null | undefined);
      if (!blobUrl) {
        res.status(404).json({ error: 'no_blob' });
        return;
      }
      const buf = await downloadBlobBlock(cfg.azureBlob.connectionString, blobUrl);
      let out = buf;
      if (isAppendLogBlobUrl(blobUrl)) {
        const line = extractJsonlEntryForRequestId(buf, id);
        if (!line) {
          res.status(404).json({ error: 'blob_entry_not_found' });
          return;
        }
        out = line;
      }
      res
        .status(200)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .send(out);
    } catch (e) {
      console.error('[request-logging-sdk] activity blob proxy failed', e);
      if (e instanceof BlobDownloadTooLargeError) {
        res.status(413).json({
          error: e.code,
          contentLength: e.contentLength,
          maxBytes: e.maxBytes,
        });
        return;
      }
      if (e instanceof RestError) {
        if (e.statusCode === 404) {
          res.status(404).json({
            error: 'blob_not_found',
            code: e.code,
            message: e.message,
          });
          return;
        }
        res.status(502).json({
          error: 'blob_download_failed',
          code: e.code,
          statusCode: e.statusCode,
          message: e.message,
        });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({
        error: 'blob_download_failed',
        message: msg,
      });
    }
  });

  r.get('/api/request/:id', async (req: Request, res: Response) => {
    const ctx = assertUiAvailable(res);
    if (!ctx) return;
    if (!assertUiSession(req, res, ctx)) return;
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'bad_id' });
      return;
    }
    const cfg = getSdkConfig();
    const repo = new RequestsRepository(ctx.pool, ctx.requestsTable);
    try {
      const row = await repo.findByIdForProject(ctx.projectId, id);
      if (!row) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const sas: { request: string | null; response: string | null } = {
        request: null,
        response: null,
      };
      if (
        cfg?.azureBlob.enabled &&
        cfg.azureBlob.connectionString &&
        cfg.azureBlob.containerName
      ) {
        const reqUrl = row.request_blob_url as string | null | undefined;
        const resUrl = row.response_blob_url as string | null | undefined;
        if (reqUrl) {
          sas.request = generateBlobReadSasUrl(
            reqUrl,
            cfg.azureBlob.connectionString,
            cfg.azureBlob.containerName,
            15,
          );
        }
        if (resUrl) {
          sas.response = generateBlobReadSasUrl(
            resUrl,
            cfg.azureBlob.connectionString,
            cfg.azureBlob.containerName,
            15,
          );
        }
      }
      res.json({ row, sas });
    } catch (e) {
      console.error('[request-logging-sdk] activity detail failed', e);
      res.status(500).json({ error: 'detail_failed' });
    }
  });

  r.get('/', (_req: Request, res: Response) => {
    const ctx = assertUiAvailable(res);
    if (!ctx) return;
    res
      .type('html')
      .send(activityLogsHtmlPage(ctx.activityLogsUiAuthRequired));
  });

  return r;
}
