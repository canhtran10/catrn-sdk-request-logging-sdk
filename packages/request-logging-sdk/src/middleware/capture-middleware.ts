import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { enqueueCapture, getSdkConfig } from '../core/init-sdk';
import type { CaptureJob } from '../types/capture-job';
import {
  isCapturePathExcluded,
  isLikelyStaticAssetPath,
} from '../utils/capture-path-filter';
import { maskObject, safeStringify } from '../utils/mask';
import { resolveCaptureContext } from './resolve-capture-context';
import { runWithRequestActionContext } from '../core/request-action-context';

const WRAPPED = Symbol('requestLoggingWrapped');

type ResWithFlag = Response & { [WRAPPED]?: boolean };

/**
 * @returns Express middleware: capture request/response metadata and enqueue async persistence
 */
export function captureMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const cfg = getSdkConfig();
      if (!cfg) {
        next();
        return;
      }

      const reqPath = req.originalUrl || req.url || '';
      if (
        isCapturePathExcluded(reqPath, cfg.capture.excludePathPrefixes) ||
        isLikelyStaticAssetPath(reqPath)
      ) {
        next();
        return;
      }

      const r = res as ResWithFlag;
      if (r[WRAPPED]) {
        next();
        return;
      }
      r[WRAPPED] = true;

      const requestId = randomUUID();
      const start = process.hrtime.bigint();
      let responseBuf = '';
      let responseTruncated = false;

      const origJson = res.json.bind(res);
      const origSend = res.send.bind(res);
      const origEnd = res.end.bind(res);

      const appendResponse = (chunk: unknown): void => {
        if (!cfg.capture.body) return;
        const { text, truncated } = safeStringify(
          chunk,
          cfg.capture.maxBodySize,
          cfg.maskFields,
        );
        const room = cfg.capture.maxBodySize - Buffer.byteLength(responseBuf, 'utf8');
        if (room <= 0) {
          responseTruncated = true;
          return;
        }
        const add = Buffer.byteLength(text, 'utf8') <= room ? text : text.slice(0, room) + '…';
        responseBuf += add;
        if (truncated) responseTruncated = true;
      };

      res.json = function (body: unknown) {
        appendResponse(body);
        return origJson(body);
      } as Response['json'];

      res.send = function (body?: unknown) {
        appendResponse(body);
        return origSend(body as never);
      } as Response['send'];

      res.end = function (chunk?: unknown, ...args: unknown[]) {
        if (chunk !== undefined && chunk !== null) appendResponse(chunk);
        return (origEnd as (...a: unknown[]) => Response).apply(res, [
          chunk,
          ...args,
        ] as never);
      } as Response['end'];

      let finished = false;
      const onFinish = () => {
        if (finished) return;
        finished = true;
        res.removeListener('finish', onFinish);
        res.removeListener('close', onFinish);
        try {
          const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
          const method = req.method;
          const url = req.originalUrl || req.url;
          const statusCode = res.statusCode || 0;

          let requestHeaders: Record<string, string> | undefined;
          if (cfg.capture.headers) {
            requestHeaders = {};
            for (const [k, v] of Object.entries(req.headers)) {
              if (v === undefined) continue;
              requestHeaders[k] = Array.isArray(v) ? v.join(',') : v;
            }
            requestHeaders = maskObject(
              requestHeaders as Record<string, unknown>,
              cfg.maskFields,
            ) as Record<string, string>;
          }

          let requestBody: unknown;
          let requestBodyTruncated = false;
          if (cfg.capture.body && req.body !== undefined) {
            const ser = safeStringify(
              req.body,
              cfg.capture.maxBodySize,
              cfg.maskFields,
            );
            try {
              requestBody = JSON.parse(ser.text);
            } catch {
              requestBody = ser.text;
            }
            requestBodyTruncated = ser.truncated;
          }

          let responseBody: unknown;
          if (cfg.capture.body && responseBuf) {
            try {
              responseBody = JSON.parse(responseBuf);
            } catch {
              responseBody = responseBuf;
            }
          }

          const ctxFields = resolveCaptureContext(req, cfg);
          const job: CaptureJob = {
            requestId,
            requestActionId: requestId,
            projectId: cfg.projectId,
            userId: ctxFields.userId ?? undefined,
            customerId: ctxFields.customerId ?? undefined,
            method,
            url,
            statusCode,
            durationMs,
            timestamp: new Date().toISOString(),
            requestHeaders,
            requestBody,
            responseBody: cfg.capture.body ? responseBody : undefined,
            requestBodyTruncated,
            responseBodyTruncated: responseTruncated || undefined,
            eventType: 'http_inbound',
            channel: 'http',
            target: url,
          };
          enqueueCapture(job);
        } catch (e) {
          console.error('[request-logging-sdk] onFinish capture failed', e);
        }
      };

      res.once('finish', onFinish);
      res.once('close', onFinish);
      runWithRequestActionContext({ requestActionId: requestId }, () => next());
    } catch (e) {
      console.error('[request-logging-sdk] captureMiddleware error', e);
      next();
    }
  };
}
