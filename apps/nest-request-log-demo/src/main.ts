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

/**
 * Boots Nest on Express with request-logging-sdk: JSON body, capture middleware, activity UI.
 */
async function bootstrap(): Promise<void> {
  await initSDK({
    projectId: process.env.REQUEST_LOG_PROJECT_ID || 'nest-demo',
    postgres: {
      connectionString: resolvePostgresConnectionString(),
      tablePrefix: process.env.REQUEST_LOG_TABLE_PREFIX || '',
    },
    /**
     * Optional: map each HTTP request to user_id / customer_id columns (headers or custom fn).
     * Demo uses headers so curl/browser can send x-user-id / x-customer-id.
     */
    captureContext: {
      userIdHeader:
        process.env.REQUEST_LOG_USER_ID_HEADER?.trim() || 'x-user-id',
      customerIdHeader:
        process.env.REQUEST_LOG_CUSTOMER_ID_HEADER?.trim() ||
        'x-customer-id',
    },
    activityLogsUi: {
      enabled: process.env.REQUEST_LOG_ACTIVITY_UI_ENABLED === 'true',
      username: process.env.REQUEST_LOG_ACTIVITY_UI_USERNAME || '',
      password: process.env.REQUEST_LOG_ACTIVITY_UI_PASSWORD || '',
    },
    // Redis: REDIS_URL or REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_TLS — see SDK README
    // Azure Blob: AZURE_BLOB_ENABLED + AZURE_BLOB_CONNECTION_STRING (+ BLOB_CONTAINER); alias: AZURE_S3_CONNECTION
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
    expressApp.use('/request-logs', createActivityLogsRouter());
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`nest-request-log-demo http://localhost:${port}`);
  if (pgCtx?.activityLogsUiEnabled) {
    console.log(`activity logs UI http://localhost:${port}/request-logs`);
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
