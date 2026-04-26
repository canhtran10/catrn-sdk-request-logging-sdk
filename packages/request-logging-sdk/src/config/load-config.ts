import type {
  SdkConfig,
  SdkInitInput,
  CaptureContextOptions,
} from '../types/sdk-config';

/**
 * @returns Optional header-based capture context from env
 */
function buildCaptureContextFromEnv(): CaptureContextOptions | undefined {
  const userIdHeader = (process.env.REQUEST_LOG_USER_ID_HEADER || '').trim();
  const customerIdHeader = (
    process.env.REQUEST_LOG_CUSTOMER_ID_HEADER || ''
  ).trim();
  if (!userIdHeader && !customerIdHeader) return undefined;
  return {
    ...(userIdHeader ? { userIdHeader } : {}),
    ...(customerIdHeader ? { customerIdHeader } : {}),
  };
}
import { sanitizeTablePrefix } from '../utils/requests-table-name';
import { resolveRedisUrlFromHostEnv } from '../utils/resolve-redis-url';

function envBool(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * @param init - initSDK() overrides (highest precedence)
 * @returns Fully merged SdkConfig
 */
export function loadConfig(init?: SdkInitInput): SdkConfig {
  const defaults: SdkConfig = {
    projectId: process.env.REQUEST_LOG_PROJECT_ID || '',
    postgres: {
      connectionString:
        process.env.PG_CONNECTION ||
        process.env.DATABASE_URL ||
        process.env.POSTGRES_CONNECTION_STRING ||
        '',
      tablePrefix: sanitizeTablePrefix(
        process.env.REQUEST_LOG_TABLE_PREFIX || '',
      ),
      autoMigrate: envBool('REQUEST_LOG_AUTO_MIGRATE', true),
    },
    activityLogsUi: {
      enabled: envBool('REQUEST_LOG_ACTIVITY_UI_ENABLED', false),
      username: (process.env.REQUEST_LOG_ACTIVITY_UI_USERNAME || '').trim(),
      password: (process.env.REQUEST_LOG_ACTIVITY_UI_PASSWORD || '').trim(),
    },
    azureBlob: {
      enabled: envBool('AZURE_BLOB_ENABLED', false),
      connectionString:
        process.env.AZURE_BLOB_CONNECTION_STRING?.trim() ||
        process.env.AZURE_S3_CONNECTION?.trim() ||
        '',
      containerName: process.env.BLOB_CONTAINER || '',
    },
    redis: {
      enabled: envBool('REDIS_ENABLED', false),
      url:
        process.env.REDIS_URL?.trim() ||
        resolveRedisUrlFromHostEnv() ||
        '',
    },
    capture: {
      headers: envBool('REQUEST_LOG_CAPTURE_HEADERS', true),
      body: envBool('REQUEST_LOG_CAPTURE_BODY', true),
      maxBodySize: envInt('REQUEST_LOG_MAX_BODY', 65536),
    },
    captureContext: buildCaptureContextFromEnv(),
    maskFields: ['password', 'token', 'authorization', 'cookie'],
    queueMaxSize: envInt('REQUEST_LOG_QUEUE_MAX', 1000),
    dbMaxRetries: envInt('REQUEST_LOG_DB_RETRIES', 3),
    errorLogThrottleMs: envInt('REQUEST_LOG_ERROR_THROTTLE_MS', 5000),
  };

  if (!init) {
    return defaults;
  }

  return {
    projectId: init.projectId ?? defaults.projectId,
    postgres: {
      connectionString:
        init.postgres?.connectionString ?? defaults.postgres.connectionString,
      tablePrefix:
        init.postgres?.tablePrefix !== undefined
          ? sanitizeTablePrefix(init.postgres.tablePrefix)
          : defaults.postgres.tablePrefix,
      autoMigrate:
        init.postgres?.autoMigrate ?? defaults.postgres.autoMigrate,
    },
    activityLogsUi: {
      enabled:
        init.activityLogsUi?.enabled ?? defaults.activityLogsUi.enabled,
      username:
        init.activityLogsUi?.username != null &&
        String(init.activityLogsUi.username).trim() !== ''
          ? String(init.activityLogsUi.username).trim()
          : defaults.activityLogsUi.username,
      password:
        init.activityLogsUi?.password != null &&
        String(init.activityLogsUi.password).trim() !== ''
          ? String(init.activityLogsUi.password).trim()
          : defaults.activityLogsUi.password,
    },
    azureBlob: {
      enabled: init.azureBlob?.enabled ?? defaults.azureBlob.enabled,
      connectionString:
        init.azureBlob?.connectionString != null &&
        String(init.azureBlob.connectionString).trim() !== ''
          ? String(init.azureBlob.connectionString).trim()
          : defaults.azureBlob.connectionString,
      containerName:
        init.azureBlob?.containerName != null &&
        String(init.azureBlob.containerName).trim() !== ''
          ? String(init.azureBlob.containerName).trim()
          : defaults.azureBlob.containerName,
    },
    redis: {
      enabled: init.redis?.enabled ?? defaults.redis.enabled,
      url:
        init.redis?.url != null && String(init.redis.url).trim() !== ''
          ? String(init.redis.url).trim()
          : defaults.redis.url,
    },
    capture: {
      headers: init.capture?.headers ?? defaults.capture.headers,
      body: init.capture?.body ?? defaults.capture.body,
      maxBodySize: init.capture?.maxBodySize ?? defaults.capture.maxBodySize,
    },
    captureContext: mergeCaptureContext(
      defaults.captureContext,
      init.captureContext,
    ),
    maskFields: init.maskFields ?? defaults.maskFields,
    queueMaxSize: init.queueMaxSize ?? defaults.queueMaxSize,
    dbMaxRetries: init.dbMaxRetries ?? defaults.dbMaxRetries,
    errorLogThrottleMs:
      init.errorLogThrottleMs ?? defaults.errorLogThrottleMs,
  };
}

/**
 * @param c - Resolved config
 * @param init - Original init input (prefix validation when set via code)
 * @returns Error message if invalid, null if OK
 */
export function validateConfig(c: SdkConfig, init?: SdkInitInput): string | null {
  if (!c.projectId) {
    return 'projectId is required (set initSDK({ projectId }) or REQUEST_LOG_PROJECT_ID)';
  }
  if (!c.postgres.connectionString) {
    return 'postgres.connectionString is required (PG_CONNECTION / DATABASE_URL)';
  }
  const tablePrefixSource =
    init?.postgres?.tablePrefix ?? process.env.REQUEST_LOG_TABLE_PREFIX ?? '';
  if (
    typeof tablePrefixSource === 'string' &&
    tablePrefixSource.trim() &&
    !sanitizeTablePrefix(tablePrefixSource)
  ) {
    return 'postgres.tablePrefix / REQUEST_LOG_TABLE_PREFIX must match /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/';
  }
  if (c.azureBlob.enabled) {
    if (!c.azureBlob.connectionString || !c.azureBlob.containerName) {
      return 'azureBlob requires connectionString and containerName when enabled';
    }
  }
  if (c.redis.enabled && !c.redis.url) {
    return 'redis.url is required when redis.enabled is true';
  }
  const uiUser = c.activityLogsUi.username?.trim() ?? '';
  const uiPass = c.activityLogsUi.password ?? '';
  if ((uiUser && !uiPass) || (!uiUser && uiPass)) {
    return 'activityLogsUi.username and activityLogsUi.password must both be set (or both empty for no UI login)';
  }
  return null;
}

/**
 * @param base - Defaults from env
 * @param override - initSDK overrides
 * @returns Merged capture context options
 */
function mergeCaptureContext(
  base: CaptureContextOptions | undefined,
  override: CaptureContextOptions | undefined,
): CaptureContextOptions | undefined {
  if (!base && !override) return undefined;
  const b = base || {};
  const o = override || {};
  const merged: CaptureContextOptions = {
    ...b,
    ...o,
    fromRequest: o.fromRequest ?? b.fromRequest,
  };
  const uh = merged.userIdHeader?.trim();
  const ch = merged.customerIdHeader?.trim();
  if (!uh && !ch && !merged.fromRequest) return undefined;
  return {
    ...(uh ? { userIdHeader: uh } : {}),
    ...(ch ? { customerIdHeader: ch } : {}),
    ...(merged.fromRequest ? { fromRequest: merged.fromRequest } : {}),
  };
}
