/**
 * @param obj - Plain object to sanitize
 * @param maskFields - Field names (case-insensitive) to replace
 */
export function maskObject(
  obj: Record<string, unknown>,
  maskFields: string[],
): Record<string, unknown> {
  const lower = new Set(maskFields.map((f) => f.toLowerCase()));
  const out: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(out)) {
    if (lower.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    }
  }
  return out;
}

/**
 * @param value - Any JSON-serializable value
 * @param maxBytes - Max UTF-8 length of output string
 * @param maskFields - Keys to mask when value is object
 */
export function safeStringify(
  value: unknown,
  maxBytes: number,
  maskFields: string[],
): { text: string; truncated: boolean } {
  try {
    let text: string;
    if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value)) {
      text = JSON.stringify(
        Array.isArray(value)
          ? value
          : maskObject(value as Record<string, unknown>, maskFields),
      );
    } else if (Buffer.isBuffer(value)) {
      text = value.toString('utf8');
    } else {
      text = String(value);
    }
    const buf = Buffer.from(text, 'utf8');
    if (buf.length > maxBytes) {
      return {
        text: buf.subarray(0, maxBytes).toString('utf8') + '…',
        truncated: true,
      };
    }
    return { text, truncated: false };
  } catch {
    return { text: '"[unserializable]"', truncated: false };
  }
}
