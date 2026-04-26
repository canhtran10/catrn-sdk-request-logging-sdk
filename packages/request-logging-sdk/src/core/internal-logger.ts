/**
 * @param throttleMs - Min gap between identical messages
 */
export function createThrottledLogger(throttleMs: number) {
  const last = new Map<string, number>();
  return (key: string, msg: string, err?: unknown): void => {
    const now = Date.now();
    const prev = last.get(key) ?? 0;
    if (now - prev < throttleMs) return;
    last.set(key, now);
    if (err !== undefined) {
      console.error(`[request-logging-sdk] ${msg}`, err);
    } else {
      console.error(`[request-logging-sdk] ${msg}`);
    }
  };
}
