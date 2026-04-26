import type { Request } from 'express';
import type { SdkConfig } from '../types/sdk-config';
import type { CaptureContextFields } from '../types/sdk-config';

/**
 * @param req - Express request
 * @param cfg - Resolved SDK config
 * @returns Trimmed user/customer ids for persistence
 */
export function resolveCaptureContext(
  req: Request,
  cfg: SdkConfig,
): CaptureContextFields {
  const opt = cfg.captureContext;
  let userId: string | undefined;
  let customerId: string | undefined;

  if (opt?.fromRequest) {
    try {
      const r = opt.fromRequest(req);
      if (r.userId != null && String(r.userId).trim() !== '') {
        userId = String(r.userId).trim();
      }
      if (r.customerId != null && String(r.customerId).trim() !== '') {
        customerId = String(r.customerId).trim();
      }
    } catch {
      /* ignore extractor errors */
    }
  }

  const readHeader = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    const key = name.toLowerCase();
    const v = req.headers[key];
    if (v === undefined) return undefined;
    const s = Array.isArray(v) ? v.join(',') : v;
    const t = s.trim();
    return t || undefined;
  };

  if (!userId && opt?.userIdHeader) {
    userId = readHeader(opt.userIdHeader);
  }
  if (!customerId && opt?.customerIdHeader) {
    customerId = readHeader(opt.customerIdHeader);
  }

  return { userId, customerId };
}
