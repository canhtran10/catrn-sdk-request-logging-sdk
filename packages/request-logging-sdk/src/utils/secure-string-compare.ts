import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string compare for credentials.
 * @param a - Expected value
 * @param b - Provided value
 * @returns True if equal
 */
export function secureStringEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
