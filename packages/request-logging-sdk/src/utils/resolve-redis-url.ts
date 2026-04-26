/**
 * @param key - Environment variable name
 * @param defaultVal - Value when unset or empty
 */
function envBool(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/**
 * Builds an ioredis URL when `REDIS_URL` is not set but `REDIS_HOST` is.
 * Uses `rediss://` when `REDIS_TLS` is true (typical Azure Cache on port 6380).
 * @returns URL string or empty when `REDIS_HOST` is missing
 */
export function resolveRedisUrlFromHostEnv(): string {
  const host = process.env.REDIS_HOST?.trim();
  if (!host) return '';

  const port = process.env.REDIS_PORT?.trim() || '6379';
  const password = process.env.REDIS_PASSWORD ?? '';
  const tls = envBool('REDIS_TLS', false);
  const scheme = tls ? 'rediss' : 'redis';
  const auth = password
    ? `:${encodeURIComponent(password)}@`
    : '';
  return `${scheme}://${auth}${host}:${port}`;
}
