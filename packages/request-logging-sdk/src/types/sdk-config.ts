import type { Request } from 'express';

/**
 * Optional identifiers attached to each captured request (DB + UI filters).
 */
export interface CaptureContextFields {
  userId?: string | null;
  customerId?: string | null;
}

/**
 * How {@link CaptureContextFields} are resolved per HTTP request.
 */
export interface CaptureContextOptions {
  /**
   * Header names (case-insensitive) when {@link CaptureContextOptions.fromRequest} is not set,
   * or to supplement empty values when used together (fromRequest wins when it returns a value).
   */
  userIdHeader?: string;
  customerIdHeader?: string;
  /**
   * Per-request resolver (highest precedence for each field when non-empty after trim).
   * @param req - Express request
   */
  fromRequest?: (req: Request) => CaptureContextFields;
}

/**
 * Resolved SDK configuration (env + initSDK overrides).
 */
export interface SdkConfig {
  projectId: string;
  postgres: {
    connectionString: string;
    /**
     * When non-empty, request rows are stored in table `{prefix}_requests` instead of `requests`.
     * Must match /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/. With default **`autoMigrate`**, {@link initSDK} creates it.
     */
    tablePrefix: string;
    /**
     * When true (default), {@link initSDK} runs {@link ensureRequestsSchema} before processing jobs.
     * Set false if you manage DDL yourself (e.g. external migrations).
     */
    autoMigrate: boolean;
  };
  activityLogsUi: {
    /** When true, {@link createActivityLogsRouter} serves HTML + JSON for this projectId */
    enabled: boolean;
    /**
     * When both are non-empty, the UI shows a login form; after success a short-lived
     * server session is stored in sessionStorage (cleared when the tab is closed).
     */
    username: string;
    password: string;
  };
  azureBlob: {
    enabled: boolean;
    connectionString: string;
    containerName: string;
  };
  redis: {
    enabled: boolean;
    url: string;
  };
  capture: {
    headers: boolean;
    body: boolean;
    maxBodySize: number;
    /**
     * Do not enqueue logs for requests whose path (no query) equals or is under these prefixes.
     * Use this to skip traffic served by the SDK itself (e.g. activity UI at `/request-logs`).
     */
    excludePathPrefixes: string[];
  };
  /** Optional user/customer ids stored on each log row */
  captureContext?: CaptureContextOptions;
  /** Lowercase header/body field names to mask */
  maskFields: string[];
  /** Max queued jobs before drop-oldest (memory) or push failure handling */
  queueMaxSize: number;
  /** Max retries for DB transient errors */
  dbMaxRetries: number;
  /** Internal rate limit for error logs (ms between identical messages) */
  errorLogThrottleMs: number;
}

export type SdkInitInput = Partial<{
  projectId: string;
  postgres: Partial<SdkConfig['postgres']>;
  azureBlob: Partial<SdkConfig['azureBlob']>;
  redis: Partial<SdkConfig['redis']>;
  capture: Partial<SdkConfig['capture']>;
  captureContext?: CaptureContextOptions;
  activityLogsUi: Partial<SdkConfig['activityLogsUi']>;
  maskFields: string[];
  queueMaxSize: number;
  dbMaxRetries: number;
  errorLogThrottleMs: number;
}>;
