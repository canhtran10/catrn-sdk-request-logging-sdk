import { randomUUID } from 'crypto';

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

const sessions = new Map<string, number>();

/**
 * Drops expired session ids (lazy cleanup).
 */
function pruneExpired(): void {
  const now = Date.now();
  for (const [id, exp] of sessions) {
    if (exp < now) sessions.delete(id);
  }
}

/**
 * @param ttlMs - Session lifetime (default 8h)
 * @returns Opaque session token for Authorization Bearer
 */
export function issueActivityUiSession(ttlMs = DEFAULT_TTL_MS): string {
  pruneExpired();
  const id = randomUUID();
  sessions.set(id, Date.now() + ttlMs);
  return id;
}

/**
 * @param token - Value from Authorization Bearer
 * @returns True if token is valid and not expired
 */
export function validateActivityUiSession(token: string | undefined): boolean {
  if (!token) return false;
  pruneExpired();
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/**
 * @description Clears all UI sessions (call from {@link shutdownSDK})
 */
export function clearActivityUiSessions(): void {
  sessions.clear();
}

/**
 * @param token - Session id to invalidate (e.g. on logout)
 */
export function destroyActivityUiSession(token: string | undefined): void {
  if (token) sessions.delete(token);
}
