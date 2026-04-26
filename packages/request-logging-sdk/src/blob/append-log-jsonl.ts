/**
 * @param urlString - Stored blob URL (with or without query)
 * @returns True if URL points to a per-bucket NDJSON append log (`requests.jsonl` / `responses.jsonl`)
 */
export function isAppendLogBlobUrl(urlString: string): boolean {
  try {
    const pathname = new URL(urlString).pathname;
    return /\/(requests|responses)\.jsonl$/i.test(pathname);
  } catch {
    return false;
  }
}

/**
 * Finds the first NDJSON line whose JSON object has `requestId` matching the given id.
 * @param content - Full append blob body
 * @param requestId - Request UUID (same as DB row id)
 * @returns UTF-8 buffer of that line only (valid JSON object), or null if not found
 */
export function extractJsonlEntryForRequestId(
  content: Buffer,
  requestId: string,
): Buffer | null {
  const text = content.toString('utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { requestId?: string };
      if (obj && typeof obj.requestId === 'string' && obj.requestId === requestId) {
        return Buffer.from(line, 'utf8');
      }
    } catch {
      continue;
    }
  }
  return null;
}
