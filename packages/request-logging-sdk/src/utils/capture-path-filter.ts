/**
 * @param originalUrlOrPath - `req.originalUrl` or `req.url` (query string is ignored)
 * @param excludePathPrefixes - Path prefixes for routes the SDK (or host) should not log
 * @returns True when this request should be skipped by capture middleware
 */
export function isCapturePathExcluded(
  originalUrlOrPath: string,
  excludePathPrefixes: readonly string[],
): boolean {
  const pathOnly = (originalUrlOrPath || '').split('?')[0] || '/';
  for (const raw of excludePathPrefixes) {
    const prefix = raw.trim();
    if (!prefix) continue;
    const p = prefix.startsWith('/') ? prefix : `/${prefix}`;
    if (pathOnly === p || pathOnly.startsWith(`${p}/`)) return true;
  }
  return false;
}

const STATIC_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.txt',
  '.xml',
]);

/**
 * @param originalUrlOrPath - `req.originalUrl` or `req.url` (query string is ignored)
 * @returns True when request path looks like a static asset file
 */
export function isLikelyStaticAssetPath(originalUrlOrPath: string): boolean {
  const pathOnly = (originalUrlOrPath || '').split('?')[0] || '/';
  const lastDot = pathOnly.lastIndexOf('.');
  if (lastDot < 0) return false;
  const lastSlash = pathOnly.lastIndexOf('/');
  if (lastDot < lastSlash) return false;
  const ext = pathOnly.slice(lastDot).toLowerCase();
  return STATIC_EXTENSIONS.has(ext);
}
