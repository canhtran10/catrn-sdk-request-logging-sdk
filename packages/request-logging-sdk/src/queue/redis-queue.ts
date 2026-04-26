import type { Redis } from 'ioredis';
import type { CaptureJob } from '../types/capture-job';
import type { QueueAdapter } from './queue-adapter';
import type { MemoryQueueAdapter } from './memory-queue';

const QUEUE_KEY = 'request-logging-sdk:jobs';

/**
 * Redis LIST (LPUSH / BRPOP). LPUSH failures route to memory adapter.
 */
export class RedisQueueAdapter implements QueueAdapter {
  constructor(
    private readonly client: Redis,
    private readonly fallback: MemoryQueueAdapter,
    private readonly onPushError: (msg: string) => void,
  ) {}

  enqueue(job: CaptureJob): void {
    const payload = JSON.stringify(job);
    try {
      if (this.client.status !== 'ready') {
        this.fallback.enqueue(job);
        return;
      }
      void this.client.lpush(QUEUE_KEY, payload).catch(() => {
        this.onPushError('Redis LPUSH failed; using memory queue');
        this.fallback.enqueue(job);
      });
    } catch {
      this.fallback.enqueue(job);
    }
  }

  async dequeue(timeoutMs: number): Promise<CaptureJob | null> {
    const sec = Math.max(1, Math.min(5, Math.ceil(timeoutMs / 1000)));
    try {
      if (this.client.status !== 'ready') {
        return this.fallback.dequeue(timeoutMs);
      }
      const r = await this.client.brpop(QUEUE_KEY, sec);
      if (r) {
        const [, raw] = r;
        return JSON.parse(raw) as CaptureJob;
      }
    } catch {
      /* fall through */
    }
    return this.fallback.dequeue(Math.max(0, timeoutMs - sec * 1000));
  }

  shutdown(): void {
    try {
      this.client.disconnect();
    } catch {
      /* ignore */
    }
  }
}
