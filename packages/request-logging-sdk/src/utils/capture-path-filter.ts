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
