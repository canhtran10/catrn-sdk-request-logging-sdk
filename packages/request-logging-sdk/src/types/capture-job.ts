/**
 * One queued capture unit processed asynchronously (never on request thread).
 */
export interface CaptureJob {
  requestId: string;
  projectId: string;
  /** Optional, from {@link SdkConfig.captureContext} */
  userId?: string | null;
  /** Optional, from {@link SdkConfig.captureContext} */
  customerId?: string | null;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
}
