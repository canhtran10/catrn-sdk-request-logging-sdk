import * as path from 'path';
import dotenv from 'dotenv';
import 'reflect-metadata';

// Load app .env regardless of process.cwd() (e.g. npm -w from monorepo root)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  initSDK,
  captureMiddleware,
  createActivityLogsRouter,
  getSdkPostgresContext,
  isRequestLoggingSdkActive,
} from '@catrn-sdk/request-logging-sdk';
import { AppModule } from './app.module';
import { resolvePostgresConnectionString } from './postgres-connection-from-env';

/** Must match `expressApp.use` below so capture excludes package UI traffic by default. */
const ACTIVITY_LOGS_UI_MOUNT = '/request-logs';

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

function resolveRedisUrlFromEnv(): string {
  const url = process.env.REDIS_URL?.trim();
  if (url) return url;
  const host = process.env.REDIS_HOST?.trim();
  if (!host) return '';
  const port = process.env.REDIS_PORT?.trim() || '6379';
  const password = process.env.REDIS_PASSWORD ?? '';
  const tls = envBool('REDIS_TLS', false);
  const scheme = tls ? 'rediss' : 'redis';
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  return `${scheme}://${auth}${host}:${port}`;
}

function parseExcludePathPrefixes(): string[] {
  if (process.env.REQUEST_LOG_EXCLUDE_PATH_PREFIXES !== undefined) {
    return process.env.REQUEST_LOG_EXCLUDE_PATH_PREFIXES.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [ACTIVITY_LOGS_UI_MOUNT];
}

function parseMaskFields(): string[] {
  const raw = process.env.REQUEST_LOG_MASK_FIELDS?.trim();
  if (!raw) {
    return ['password', 'token', 'authorization', 'cookie'];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Boots Nest on Express with request-logging-sdk: JSON body, capture middleware, activity UI.
 */
async function bootstrap(): Promise<void> {
  await initSDK({
    projectId: process.env.REQUEST_LOG_PROJECT_ID || 'nest-demo',
    postgres: {
      connectionString: resolvePostgresConnectionString(),
      tablePrefix: process.env.REQUEST_LOG_TABLE_PREFIX || '',
      autoMigrate: envBool('REQUEST_LOG_AUTO_MIGRATE', true),
    },
    activityLogsUi: {
      enabled: envBool('REQUEST_LOG_ACTIVITY_UI_ENABLED', false),
      username: (process.env.REQUEST_LOG_ACTIVITY_UI_USERNAME || '').trim(),
      password: process.env.REQUEST_LOG_ACTIVITY_UI_PASSWORD || '',
    },
    azureBlob: {
      enabled: envBool('AZURE_BLOB_ENABLED', false),
      connectionString:
        process.env.AZURE_BLOB_CONNECTION_STRING?.trim() ||
        process.env.AZURE_S3_CONNECTION?.trim() ||
        '',
      containerName: (process.env.BLOB_CONTAINER || '').trim(),
    },
    redis: {
      enabled: envBool('REDIS_ENABLED', false),
      url: resolveRedisUrlFromEnv(),
    },
    capture: {
      headers: envBool('REQUEST_LOG_CAPTURE_HEADERS', true),
      body: envBool('REQUEST_LOG_CAPTURE_BODY', true),
      maxBodySize: envInt('REQUEST_LOG_MAX_BODY', 65536),
      excludePathPrefixes: parseExcludePathPrefixes(),
    },
    captureContext: {
      userIdHeader:
        process.env.REQUEST_LOG_USER_ID_HEADER?.trim() || 'x-user-id',
      customerIdHeader:
        process.env.REQUEST_LOG_CUSTOMER_ID_HEADER?.trim() ||
        'x-customer-id',
      fromRequest: (req) => {
        console.log('fromRequest', req.headers);
        return {
          userId: req.headers['x-user-id'] as string || '--user-id',
          customerId: req.headers['x-customer-id'] as string || '--customer-id',
        };
      },
    },
    maskFields: parseMaskFields(),
    queueMaxSize: envInt('REQUEST_LOG_QUEUE_MAX', 1000),
    dbMaxRetries: envInt('REQUEST_LOG_DB_RETRIES', 3),
    errorLogThrottleMs: envInt('REQUEST_LOG_ERROR_THROTTLE_MS', 5000),
  });

  if (!isRequestLoggingSdkActive()) {
    console.error(
      '[nest-request-log-demo] @catrn-sdk/request-logging-sdk did not initialize (check PG_CONNECTION / DATABASE_URL / POSTGRES_* and logs above). Exiting.',
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use(captureMiddleware());
  const pgCtx = getSdkPostgresContext();
  if (pgCtx?.activityLogsUiEnabled) {
    // Do not redirect between /request-logs and /request-logs/: some stacks add a trailing slash (301),
    // which would ping-pong with a redirect the other way (ERR_TOO_MANY_REDIRECTS). This mount matches both.
    expressApp.use(ACTIVITY_LOGS_UI_MOUNT, createActivityLogsRouter());
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`nest-request-log-demo http://localhost:${port}`);
  if (pgCtx?.activityLogsUiEnabled) {
    console.log(
      `activity logs UI http://localhost:${port}${ACTIVITY_LOGS_UI_MOUNT}`,
    );
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
