import { randomUUID } from 'crypto';
import { enqueueCapture, getSdkConfig } from '../core/init-sdk';
import type { CaptureJob } from '../types/capture-job';
import { safeStringify } from '../utils/mask';
import { getRequestActionContext } from '../core/request-action-context';

export interface ThirdPartyCaptureInput {
  provider: string;
  target: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  timestamp?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  userId?: string | null;
  customerId?: string | null;
  channel?: 'http' | 'email' | 'sms' | 'api';
  meta?: Record<string, unknown>;
}

export interface PostgresQueryCaptureInput {
  operation: string;
  target?: string;
  statusCode?: number;
  durationMs?: number;
  timestamp?: string;
  queryText?: string;
  userId?: string | null;
  customerId?: string | null;
  meta?: Record<string, unknown>;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function captureThirdPartyEvent(input: ThirdPartyCaptureInput): string | null {
  const cfg = getSdkConfig();
  if (!cfg || !cfg.capture.thirdParty.enabled) return null;
  const timestamp = input.timestamp || new Date().toISOString();
  const requestCtx = getRequestActionContext();
  let requestBody: unknown;
  let responseBody: unknown;
  let requestBodyTruncated = false;
  let responseBodyTruncated = false;
  if (cfg.capture.thirdParty.captureRequestBody && input.requestBody !== undefined) {
    const serialized = safeStringify(
      input.requestBody,
      cfg.capture.thirdParty.maxBodySize,
      cfg.maskFields,
    );
    requestBody = parseMaybeJson(serialized.text);
    requestBodyTruncated = serialized.truncated;
  }
  if (
    cfg.capture.thirdParty.captureResponseBody &&
    input.responseBody !== undefined
  ) {
    const serialized = safeStringify(
      input.responseBody,
      cfg.capture.thirdParty.maxBodySize,
      cfg.maskFields,
    );
    responseBody = parseMaybeJson(serialized.text);
    responseBodyTruncated = serialized.truncated;
  }
  const job: CaptureJob = {
    requestId: randomUUID(),
    requestActionId: requestCtx?.requestActionId,
    projectId: cfg.projectId,
    userId: input.userId ?? undefined,
    customerId: input.customerId ?? undefined,
    method: (input.method || 'THIRD_PARTY').toUpperCase(),
    url: input.target,
    statusCode: input.statusCode ?? 0,
    durationMs: input.durationMs ?? 0,
    timestamp,
    requestBody,
    responseBody,
    requestBodyTruncated: requestBodyTruncated || undefined,
    responseBodyTruncated: responseBodyTruncated || undefined,
    eventType: 'third_party',
    channel: input.channel ?? 'api',
    provider: input.provider,
    target: input.target,
    meta: input.meta,
  };
  enqueueCapture(job);
  return job.requestId;
}

export function capturePostgresQueryEvent(
  input: PostgresQueryCaptureInput,
): string | null {
  const cfg = getSdkConfig();
  if (!cfg || !cfg.capture.db.postgres.enabled) return null;
  const requestCtx = getRequestActionContext();
  let requestBody: unknown;
  let requestBodyTruncated = false;
  if (cfg.capture.db.postgres.captureQueryText && input.queryText !== undefined) {
    const serialized = safeStringify(
      input.queryText,
      cfg.capture.db.postgres.maxQuerySize,
      cfg.maskFields,
    );
    requestBody = serialized.text;
    requestBodyTruncated = serialized.truncated;
  }
  const job: CaptureJob = {
    requestId: randomUUID(),
    requestActionId: requestCtx?.requestActionId,
    projectId: cfg.projectId,
    userId: input.userId ?? undefined,
    customerId: input.customerId ?? undefined,
    method: (input.operation || 'QUERY').toUpperCase(),
    url: input.target || 'postgres://query',
    statusCode: input.statusCode ?? 0,
    durationMs: input.durationMs ?? 0,
    timestamp: input.timestamp || new Date().toISOString(),
    requestBody,
    requestBodyTruncated: requestBodyTruncated || undefined,
    eventType: 'db_query',
    channel: 'db',
    provider: 'postgres',
    dbSystem: 'postgres',
    operation: input.operation,
    target: input.target,
    meta: input.meta,
  };
  enqueueCapture(job);
  return job.requestId;
}
