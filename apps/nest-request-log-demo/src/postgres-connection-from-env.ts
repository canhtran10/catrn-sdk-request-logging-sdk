import * as fs from 'fs';
import * as path from 'path';

const PG_SSLMODES = new Set([
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
]);

/**
 * Maps env-friendly flags to libpq `sslmode` query values.
 * `false` / `off` are not valid sslmode tokens; without this, `pg` may still negotiate SSL.
 *
 * @param raw - `POSTGRES_SSLMODE` (may be empty)
 * @param host - `POSTGRES_HOST` (used when raw is empty: local → disable, else → require)
 */
function resolveSslModeForDiscreteHost(raw: string | undefined, host: string): {
  sslmode: string;
  useSslRootCert: boolean;
} {
  const t = (raw ?? '').trim().toLowerCase();
  const h = host.toLowerCase();

  const isLocalHost =
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.endsWith('.local');

  if (!t) {
    return {
      sslmode: isLocalHost ? 'disable' : 'require',
      useSslRootCert: !isLocalHost,
    };
  }

  if (['false', '0', 'off', 'no', 'none'].includes(t)) {
    return { sslmode: 'disable', useSslRootCert: false };
  }
  if (['true', '1', 'yes', 'on'].includes(t)) {
    return { sslmode: 'require', useSslRootCert: true };
  }
  if (PG_SSLMODES.has(t)) {
    const useCert = t !== 'disable' && t !== 'allow' && t !== 'prefer';
    return { sslmode: t, useSslRootCert: useCert };
  }

  console.warn(
    `[nest-request-log-demo] Unknown POSTGRES_SSLMODE="${raw}"; using ${isLocalHost ? 'disable' : 'require'}`,
  );
  return {
    sslmode: isLocalHost ? 'disable' : 'require',
    useSslRootCert: !isLocalHost,
  };
}

/**
 * Resolves Postgres connection string: prefers `PG_CONNECTION` / `DATABASE_URL`,
 * otherwise builds a URI from `POSTGRES_*` (Azure-friendly, optional `sslrootcert`).
 * Password and user are URL-encoded for special characters (e.g. `&` in password).
 *
 * **Discrete `POSTGRES_*` mode:** `POSTGRES_SSLMODE` unset → `sslmode=disable` for
 * `localhost` / `127.0.0.1` / `::1`, otherwise `require` (Azure). Use `false`/`off`
 * to force no SSL; use `require`/`verify-full` for managed Postgres.
 *
 * **Single URI mode:** pass full `PG_CONNECTION` / `DATABASE_URL` (e.g. Azure) with
 * the desired `sslmode` already in the string; discrete SSL env vars are not merged in.
 *
 * @returns URI for `pg` / `initSDK`, or empty string if nothing configured
 */
export function resolvePostgresConnectionString(): string {
  const direct =
    process.env.PG_CONNECTION?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (direct) return direct;

  const host = process.env.POSTGRES_HOST?.trim();
  if (!host) return '';

  const port = process.env.POSTGRES_PORT?.trim() || '5432';
  const user = process.env.POSTGRES_USER ?? '';
  const password = process.env.POSTGRES_PASSWORD ?? '';
  const database = process.env.POSTGRES_DATABASE ?? '';
  const { sslmode, useSslRootCert } = resolveSslModeForDiscreteHost(
    process.env.POSTGRES_SSLMODE,
    host,
  );

  const params = new URLSearchParams();
  params.set('sslmode', sslmode);
  const libpqCompat = ['1', 'true', 'yes', 'on'].includes(
    (process.env.POSTGRES_SSL_LIBPQ_COMPAT || '').toLowerCase(),
  );
  if (libpqCompat) {
    params.set('uselibpqcompat', 'true');
  }

  const certRel = process.env.POSTGRES_CERT_PATH?.trim();
  if (certRel && useSslRootCert) {
    const absCert = path.isAbsolute(certRel)
      ? certRel
      : path.resolve(process.cwd(), certRel);
    if (fs.existsSync(absCert)) {
      params.set('sslrootcert', absCert);
    } else {
      console.warn(
        `[nest-request-log-demo] POSTGRES_CERT_PATH not found: ${absCert} (omit sslrootcert in URI)`,
      );
    }
  } else if (certRel && !useSslRootCert) {
    /* ssl off: ignore cert path for the URI */
  }

  const u = encodeURIComponent(user);
  const p = encodeURIComponent(password);
  return `postgresql://${u}:${p}@${host}:${port}/${database}?${params.toString()}`;
}
