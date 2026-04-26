import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig, validateConfig } from '../config/load-config';
import { ensureRequestsSchema } from '../db/ensure-requests-schema';
import { getRequestsTableName } from '../utils/requests-table-name';
import type { SdkConfig, SdkInitInput } from '../types/sdk-config';
import type { QueueAdapter } from '../queue/queue-adapter';
import { MemoryQueueAdapter } from '../queue/memory-queue';
import { RedisQueueAdapter } from '../queue/redis-queue';
import { JobProcessor } from '../worker/job-processor';
import type { CaptureJob } from '../types/capture-job';
import { createThrottledLogger } from './internal-logger';
import { clearActivityUiSessions } from '../ui/activity-ui-sessions';

let config: SdkConfig | null = null;
let queue: QueueAdapter | null = null;
let pool: Pool | null = null;
let processor: JobProcessor | null = null;
let loopRunning = false;
let initOnce = false;
let warnedNoInit = false;
let redisClient: Redis | null = null;
let throttledLog: ReturnType<typeof createThrottledLogger> | null = null;

/**
 * @param msg - Error context
 * @param err - Optional underlying error
 */
function logError(msg: string, err?: unknown): void {
  if (throttledLog) {
    throttledLog('sdk', msg, err);
  } else {
    console.error(`[request-logging-sdk] ${msg}`, err);
  }
}

/**
 * Initializes queue, Postgres pool, and background processor.
 *
 * When **`postgres.autoMigrate`** is true (the default), this function **creates or updates**
 * the request log table and indexes (`requests` or `{prefix}_requests`) before any jobs run.
 * Set **`autoMigrate: false`** only if another process already owns that DDL.
 *
 * @param init - Optional overrides (merged over env)
 */
export async function initSDK(init?: SdkInitInput): Promise<void> {
  if (initOnce) {
    console.warn('[request-logging-sdk] initSDK called more than once; ignoring');
    return;
  }
  const cfg = loadConfig(init);
  const invalid = validateConfig(cfg, init);
  if (invalid) {
    console.error(`[request-logging-sdk] ${invalid}; SDK disabled`);
    return;
  }
  initOnce = true;
  config = cfg;
  throttledLog = createThrottledLogger(cfg.errorLogThrottleMs);

  const memory = new MemoryQueueAdapter(cfg.queueMaxSize);

  if (cfg.redis.enabled && cfg.redis.url) {
    try {
      redisClient = new Redis(cfg.redis.url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      });
      redisClient.on('error', () => {
        logError('Redis client error');
      });
      queue = new RedisQueueAdapter(redisClient, memory, (m) => logError(m));
    } catch (e) {
      logError('Redis init failed; using memory queue only', e);
      redisClient = null;
      queue = memory;
    }
  } else {
    queue = memory;
  }

  pool = new Pool({
    connectionString: cfg.postgres.connectionString,
    max: 5,
  });
  pool.on('error', (e) => logError('pg pool error', e));

  if (cfg.postgres.autoMigrate) {
    try {
      await ensureRequestsSchema(pool, cfg.postgres.tablePrefix);
    } catch (e) {
      logError('ensureRequestsSchema (auto-migration) failed; SDK disabled', e);
      await rollbackPartialInit();
      return;
    }
  }

  processor = new JobProcessor(cfg, pool, logError);

  void runProcessorLoop();
}

async function rollbackPartialInit(): Promise<void> {
  loopRunning = false;
  try {
    (queue as RedisQueueAdapter | null)?.shutdown?.();
  } catch {
    /* ignore */
  }
  redisClient = null;
  queue = null;
  clearActivityUiSessions();
  await pool?.end().catch(() => undefined);
  pool = null;
  processor = null;
  config = null;
  throttledLog = null;
  initOnce = false;
}

/**
 * @param job - Enqueued from middleware
 */
export function enqueueCapture(job: CaptureJob): void {
  try {
    if (!queue) {
      if (!warnedNoInit) {
        warnedNoInit = true;
        console.warn(
          '[request-logging-sdk] captureMiddleware used before initSDK(); dropping',
        );
      }
      return;
    }
    queue.enqueue(job);
  } catch (e) {
    logError('enqueueCapture failed', e);
  }
}

/**
 * @returns True after {@link initSDK} completed successfully (pool + config active).
 * False if init was skipped, failed validation/migration, or after {@link shutdownSDK}.
 */
export function isRequestLoggingSdkActive(): boolean {
  return pool !== null && config !== null;
}

/**
 * @returns Resolved config or null if not initialized
 */
export function getSdkConfig(): SdkConfig | null {
  return config;
}

/**
 * @returns Pool + project + activity UI flags for the activity logs router, or null if not initialized
 */
export function getSdkPostgresContext(): {
  pool: Pool;
  projectId: string;
  requestsTable: string;
  activityLogsUiEnabled: boolean;
  activityLogsUiUsername: string;
  activityLogsUiPassword: string;
  activityLogsUiAuthRequired: boolean;
} | null {
  if (!pool || !config) return null;
  const u = config.activityLogsUi.username?.trim() ?? '';
  const p = config.activityLogsUi.password;
  const authRequired = Boolean(u && p);
  return {
    pool,
    projectId: config.projectId,
    requestsTable: getRequestsTableName(config.postgres.tablePrefix),
    activityLogsUiEnabled: config.activityLogsUi.enabled,
    activityLogsUiUsername: config.activityLogsUi.username,
    activityLogsUiPassword: config.activityLogsUi.password,
    activityLogsUiAuthRequired: authRequired,
  };
}

/**
 * @description Stops background loop and closes connections (tests / graceful shutdown)
 */
export async function shutdownSDK(): Promise<void> {
  loopRunning = false;
  try {
    (queue as RedisQueueAdapter | null)?.shutdown?.();
  } catch {
    /* ignore */
  }
  redisClient = null;
  queue = null;
  clearActivityUiSessions();
  await pool?.end().catch(() => undefined);
  pool = null;
  processor = null;
  config = null;
  throttledLog = null;
  initOnce = false;
}

async function runProcessorLoop(): Promise<void> {
  if (!queue || !processor) return;
  loopRunning = true;
  while (loopRunning && queue) {
    try {
      const job = await queue.dequeue(2000);
      if (job && loopRunning && processor) {
        await processor.process(job).catch((e) => logError('process job', e));
      }
    } catch (e) {
      logError('processor loop', e);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
